"""Concurrent BFS network crawler engine."""

from __future__ import annotations
import concurrent.futures
from collections import deque
import logging
import re
import time
from typing import Callable, Dict, List, Optional, Set, Tuple

from netcrawl.crawler.mock_network import MockSSHClient
from netcrawl.crawler.ssh_client import CiscoSSHClient
from netcrawl.models import (
    Device,
    DeviceRole,
    DeviceStatus,
)
from netcrawl.parsers.ios_parsers import (
    parse_arp_table,
    parse_cdp_neighbors_detail,
    parse_interfaces_detail,
    parse_ip_interface_brief,
    parse_routes,
    parse_site_info,
    parse_switchport_or_trunk,
    parse_version,
    parse_vlans,
)

logger = logging.getLogger(__name__)


class NetworkCrawler:
    """Manages concurrent SSH crawling of Cisco IOS devices via CDP neighbors."""

    def __init__(
        self,
        seed_devices: List[str],
        username: str = "admin",
        password: str = "cisco",
        secret: str = "",
        key_file: Optional[str] = None,
        port: int = 22,
        fallback_credentials: Optional[List[Dict[str, Any]]] = None,
        max_workers: int = 15,
        ssh_timeout: int = 15,
        use_mock: bool = False,
        hostname_regex: Optional[str] = None,
        excluded_platform_patterns: Optional[List[str]] = None,
        excluded_role_patterns: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[str, str], None]] = None,
    ):
        self.seed_devices = [s.strip() for s in seed_devices if s.strip()]
        self.username = username
        self.password = password
        self.secret = secret
        self.key_file = key_file
        self.port = port
        self.fallback_credentials = fallback_credentials or []
        self.max_workers = max_workers
        self.ssh_timeout = ssh_timeout
        self.use_mock = use_mock
        self.hostname_regex = hostname_regex
        self.excluded_platform_patterns = excluded_platform_patterns
        self.excluded_role_patterns = excluded_role_patterns
        self.progress_callback = progress_callback

        # Internal state
        self.visited_ips: Set[str] = set()
        self.visited_hosts: Set[str] = set()
        self.queued_targets: Set[str] = set()
        self.discovered_via_map: Dict[str, str] = {} # ip -> discovered_via string
        self.known_hostname_map: Dict[str, str] = {} # ip -> hostname (if pre-known from CDP)

    def _notify(self, level: str, message: str) -> None:
        if self.progress_callback:
            self.progress_callback(level, message)
        logger.info(f"[{level.upper()}] {message}")

    def _determine_role(self, hostname: str, routes: list, intfs: dict, vlans: list, site_info: Optional[any]) -> DeviceRole:
        """Heuristic to determine if a device is a Router, L3 Switch, or L2 Switch."""
        lower_host = hostname.lower()
        
        # Check site_info role code first
        if site_info:
            code = site_info.role_code.lower()
            if any(k in code for k in ["cr", "rt", "gw", "router"]):
                return DeviceRole.ROUTER
            if any(k in code for k in ["cs", "ds", "l3sw", "ms"]):
                return DeviceRole.L3_SWITCH
            if any(k in code for k in ["as", "swas", "acc", "l2sw"]):
                return DeviceRole.L2_SWITCH

        # Check hostname keywords
        if any(k in lower_host for k in ["-rt", "-cr", "router", "core-rt"]):
            return DeviceRole.ROUTER

        # Check routing table & SVIs
        has_routed_svi = any(intf.is_svi and intf.ip_address for intf in intfs.values())
        has_multiple_routes = len([r for r in routes if r.next_hop != "DIRECTLY_CONNECTED"]) > 1

        if (has_routed_svi and has_multiple_routes) or any(k in lower_host for k in ["-ds", "swds", "dist", "core-sw"]):
            return DeviceRole.L3_SWITCH
        
        if vlans and not has_multiple_routes:
            return DeviceRole.L2_SWITCH

        if len(routes) > 2 and not vlans:
            return DeviceRole.ROUTER

        return DeviceRole.L2_SWITCH if vlans else DeviceRole.L3_SWITCH

    def _crawl_single_device(self, target_ip: str) -> Device:
        """Connect to one device, run show commands, parse output, and return Device model."""
        discovered_via = self.discovered_via_map.get(target_ip)
        pre_known_name = self.known_hostname_map.get(target_ip)

        # Select client (Mock or real SSH)
        if self.use_mock:
            client = MockSSHClient(host=target_ip)
        else:
            client = CiscoSSHClient(
                host=target_ip,
                username=self.username,
                password=self.password,
                secret=self.secret,
                key_file=self.key_file,
                port=self.port,
                timeout=self.ssh_timeout,
            )

        success, err = client.connect()
        if not success:
            err_lower = (err or "").lower()
            if "auth" in err_lower or "password" in err_lower:
                fail_status = DeviceStatus.AUTH_FAILED
                # Attempt fallback credentials if configured
                if not self.use_mock and self.fallback_credentials:
                    for fallback in self.fallback_credentials:
                        fb_client = CiscoSSHClient(
                            host=target_ip,
                            username=fallback.get("username", self.username),
                            password=fallback.get("password", ""),
                            secret=fallback.get("secret", ""),
                            key_file=fallback.get("key_file"),
                            port=fallback.get("port", self.port),
                            timeout=self.ssh_timeout,
                        )
                        fb_success, fb_err = fb_client.connect()
                        if fb_success:
                            client = fb_client
                            success = True
                            err = None
                            from netcrawl.audit.logger import get_audit_logger
                            get_audit_logger().log(
                                event_type="CREDENTIAL_FALLBACK_SUCCESS",
                                severity="INFO",
                                device_ip=target_ip,
                                details={"user": fallback.get("username")},
                            )
                            break
            elif "timeout" in err_lower or "timed out" in err_lower:
                fail_status = DeviceStatus.TIMEOUT
            else:
                fail_status = DeviceStatus.UNREACHABLE

            if not success:
                host_label = pre_known_name or f"Unknown-{target_ip}"
                site_info = parse_site_info(host_label, self.hostname_regex)
                return Device(
                    hostname=host_label,
                    ip_address=target_ip,
                    status=fail_status,
                    failure_reason=err,
                    discovered_via=discovered_via,
                    site_info=site_info,
                )

        try:
            # Send terminal settings safely (whitelist verified)
            try:
                client.send_command("terminal length 0")
                client.send_command("terminal width 512")
            except Exception:
                pass

            # Gather read-only data
            out_version = client.send_command("show version")
            out_ip_int = client.send_command("show ip interface brief")
            out_intfs = client.send_command("show interfaces")
            
            # Trunk or switchport
            out_trunk = client.send_command("show interfaces trunk")
            if not out_trunk or "% Invalid input" in out_trunk or "Port" not in out_trunk:
                out_trunk = client.send_command("show interfaces switchport")

            out_routes = client.send_command("show ip route")
            out_vlans = client.send_command("show vlan brief")
            if not out_vlans or "% Invalid input" in out_vlans:
                out_vlans = client.send_command("show vlan")

            out_cdp = client.send_command("show cdp neighbors detail")
            out_arp = client.send_command("show ip arp")

        finally:
            client.disconnect()

        # Parse command outputs
        ver_data = parse_version(out_version)
        hostname = ver_data.get("hostname") or pre_known_name or target_ip
        hostname = hostname.split(".")[0].strip() # remove domain suffix

        # Audit & Archive verbatim command responses
        from netcrawl.audit.logger import get_audit_logger
        audit = get_audit_logger()
        for cmd_name, raw_text in [
            ("show_version", out_version),
            ("show_ip_interface_brief", out_ip_int),
            ("show_interfaces", out_intfs),
            ("show_trunk_or_switchport", out_trunk),
            ("show_ip_route", out_routes),
            ("show_vlan", out_vlans),
            ("show_cdp_neighbors_detail", out_cdp),
            ("show_ip_arp", out_arp),
        ]:
            if raw_text:
                audit.archive_command_response(
                    snapshot_id=None,
                    device_hostname=hostname,
                    device_ip=target_ip,
                    command=cmd_name,
                    response_output=raw_text,
                )

        site_info = parse_site_info(hostname, self.hostname_regex)
        interfaces = parse_ip_interface_brief(out_ip_int)
        interfaces = parse_interfaces_detail(out_intfs, interfaces)
        interfaces = parse_switchport_or_trunk(out_trunk, interfaces)
        routes = parse_routes(out_routes)
        vlans = parse_vlans(out_vlans)
        cdp_neighbors = parse_cdp_neighbors_detail(
            out_cdp,
            excluded_platform_patterns=self.excluded_platform_patterns,
            excluded_role_patterns=self.excluded_role_patterns,
        )
        arp_table = parse_arp_table(out_arp)

        role = self._determine_role(hostname, routes, interfaces, vlans, site_info)

        audit.log(
            event_type="DEVICE_DATA_COLLECTED",
            severity="INFO",
            device_ip=target_ip,
            hostname=hostname,
            details={
                "role": role.value,
                "platform": ver_data.get("platform"),
                "interfaces_count": len(interfaces),
                "routes_count": len(routes),
                "vlans_count": len(vlans),
                "cdp_neighbors_count": len(cdp_neighbors),
                "arp_count": len(arp_table),
            },
        )

        return Device(
            hostname=hostname,
            ip_address=target_ip,
            platform=ver_data.get("platform"),
            os_version=ver_data.get("os_version"),
            serial_number=ver_data.get("serial_number"),
            role=role,
            status=DeviceStatus.REACHABLE,
            discovered_via=discovered_via,
            site_info=site_info,
            interfaces=interfaces,
            routes=routes,
            vlans=vlans,
            cdp_neighbors=cdp_neighbors,
            arp_table=arp_table,
        )

    def crawl(self) -> Tuple[List[Device], List[Device]]:
        """
        Execute concurrent network crawl starting from seed IPs and spidering via CDP neighbors.
        Returns (reachable_devices, unreachable_devices).
        """
        start_time = time.time()
        self._notify("info", f"Starting network crawl with seeds: {', '.join(self.seed_devices)}")

        from netcrawl.audit.logger import get_audit_logger
        audit = get_audit_logger()
        audit.log(
            event_type="CRAWL_START",
            severity="INFO",
            details={
                "seed_devices": self.seed_devices,
                "max_workers": self.max_workers,
                "use_mock": self.use_mock,
            },
        )

        reachable_devices: List[Device] = []
        unreachable_devices: List[Device] = []

        # Queue for discovery
        active_futures: Dict[concurrent.futures.Future, str] = {}
        pending_targets: deque = deque()

        for seed in self.seed_devices:
            self.queued_targets.add(seed)
            pending_targets.append(seed)

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            while pending_targets or active_futures:
                # Submit up to max_workers
                while pending_targets and len(active_futures) < self.max_workers:
                    target_ip = pending_targets.popleft()
                    if target_ip in self.visited_ips:
                        continue
                    self.visited_ips.add(target_ip)
                    self._notify("crawl", f"Crawling device at {target_ip}...")
                    future = executor.submit(self._crawl_single_device, target_ip)
                    active_futures[future] = target_ip

                if not active_futures:
                    break

                # Wait for the next future to complete
                done, _ = concurrent.futures.wait(
                    active_futures.keys(),
                    return_when=concurrent.futures.FIRST_COMPLETED,
                )

                for future in done:
                    target_ip = active_futures.pop(future)
                    try:
                        device = future.result()
                    except Exception as exc:
                        logger.error(f"Unexpected error crawling {target_ip}: {exc}", exc_info=True)
                        device = Device(
                            hostname=f"Unknown-{target_ip}",
                            ip_address=target_ip,
                            status=DeviceStatus.ERROR,
                            failure_reason=str(exc),
                            discovered_via=self.discovered_via_map.get(target_ip),
                        )

                    if device.status == DeviceStatus.REACHABLE:
                        self.visited_hosts.add(device.hostname.lower())
                        reachable_devices.append(device)
                        self._notify(
                            "success",
                            f"Discovered {device.hostname} ({device.ip_address}) [{device.role.value}] - "
                            f"{len(device.interfaces)} interfaces, {len(device.routes)} routes, "
                            f"{len(device.cdp_neighbors)} CDP neighbors"
                        )

                        # Process CDP neighbors for spidering
                        for neighbor in device.cdp_neighbors:
                            # CRITICAL SAFETY CHECK: Skip Access Points and phones!
                            if neighbor.is_ap:
                                self._notify("debug", f"Skipping Wireless AP or non-switch neighbor '{neighbor.destination_host}'")
                                audit.log(
                                    event_type="AP_FILTERED",
                                    severity="INFO",
                                    hostname=neighbor.destination_host,
                                    device_ip=neighbor.management_ip,
                                    details={
                                        "platform": neighbor.platform,
                                        "capabilities": neighbor.capabilities,
                                        "discovered_on": f"{device.hostname}:{neighbor.local_interface}",
                                    },
                                )
                                continue

                            neighbor_ip = neighbor.management_ip
                            neighbor_host = neighbor.destination_host.split(".")[0].strip()

                            if not neighbor_ip:
                                continue

                            if (
                                neighbor_ip not in self.visited_ips
                                and neighbor_ip not in self.queued_targets
                                and neighbor_host.lower() not in self.visited_hosts
                            ):
                                self.queued_targets.add(neighbor_ip)
                                self.discovered_via_map[neighbor_ip] = (
                                    f"{device.hostname} ({neighbor.local_interface} -> {neighbor.remote_interface})"
                                )
                                self.known_hostname_map[neighbor_ip] = neighbor_host
                                pending_targets.append(neighbor_ip)
                                self._notify(
                                    "spider",
                                    f"Queued new neighbor {neighbor_host} ({neighbor_ip}) discovered via {device.hostname}"
                                )
                    else:
                        unreachable_devices.append(device)
                        audit.log(
                            event_type="DEVICE_UNREACHABLE",
                            severity="WARNING",
                            device_ip=device.ip_address,
                            hostname=device.hostname,
                            details={
                                "failure_reason": device.failure_reason,
                                "discovered_via": device.discovered_via,
                                "status": device.status.value,
                            },
                        )
                        self._notify(
                            "warning",
                            f"FAILED to connect to {device.hostname} ({device.ip_address}): {device.failure_reason}. "
                            f"FLAGGED FOR INVESTIGATION!"
                        )

        elapsed = time.time() - start_time
        audit.log(
            event_type="CRAWL_COMPLETE",
            severity="INFO",
            details={
                "duration_seconds": round(elapsed, 3),
                "reachable_count": len(reachable_devices),
                "unreachable_count": len(unreachable_devices),
                "total_count": len(reachable_devices) + len(unreachable_devices),
            },
        )
        self._notify(
            "info",
            f"Crawl finished in {elapsed:.2f}s: {len(reachable_devices)} reachable, "
            f"{len(unreachable_devices)} unreachable/flagged"
        )
        return reachable_devices, unreachable_devices
