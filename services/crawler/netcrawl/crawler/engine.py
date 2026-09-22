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
    CrawlProfile,
    DeviceRole,
    DeviceStatus,
)
from netcrawl.parsers.ios_parsers import (
    parse_arp_table,
    parse_cdp_neighbors_detail,
    parse_interfaces_detail,
    parse_ip_interface_brief,
    parse_lldp_neighbors_detail,
    parse_routes,
    parse_site_info,
    parse_switchport_or_trunk,
    parse_version,
    parse_vlans,
)

logger = logging.getLogger(__name__)


class NetworkCrawler:
    """Manages concurrent SSH crawling of Cisco IOS devices via CDP/LLDP neighbors."""

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
        crawl_profile: str = "intensive",
        max_hops: Optional[int] = None,
        enable_lldp: bool = False,
        lldp_fallback_on_cdp_fail: bool = True,
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
        self.crawl_profile = crawl_profile.lower()
        # Default hop depth is 1. Hard-capped at 10 to prevent runaway crawls and loop formation.
        if max_hops is not None:
            self.max_hops = max(1, min(int(max_hops), 10))
        else:
            self.max_hops = 1
        self.enable_lldp = enable_lldp
        self.lldp_fallback_on_cdp_fail = lldp_fallback_on_cdp_fail
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
        self.reseed_points: List[Dict[str, Any]] = [] # devices at boundary with unvisited neighbors at max_hops + 1

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

    def _crawl_single_device(self, target_ip: str, current_hop: int = 0) -> Device:
        """Connect to one device, run profile-specific show commands, parse output, and return Device model."""
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

        t_auth_start = time.time()
        success, err = client.connect()
        auth_time_ms = int((time.time() - t_auth_start) * 1000)
        credential_used = f"Primary ({self.username})" if success else None

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
                        fb_t_start = time.time()
                        fb_success, fb_err = fb_client.connect()
                        if fb_success:
                            client = fb_client
                            success = True
                            err = None
                            credential_used = f"Fallback ({fallback.get('username')})"
                            auth_time_ms = int((time.time() - fb_t_start) * 1000)
                            from netcrawl.audit.logger import get_audit_logger
                            get_audit_logger().log(
                                event_type="CREDENTIAL_FALLBACK_SUCCESS",
                                severity="INFO",
                                device_ip=target_ip,
                                details={"user": fallback.get("username"), "latency_ms": auth_time_ms},
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
                    credential_used=None,
                    auth_time_ms=auth_time_ms,
                    hop_distance=current_hop,
                    site_info=site_info,
                )

        is_discovery = self.crawl_profile == "discovery"
        is_mapping = self.crawl_profile == "mapping"
        # If intensive: run all diagnostics

        out_version = ""
        out_ip_int = ""
        out_intfs = ""
        out_trunk = ""
        out_routes = ""
        out_vlans = ""
        out_cdp = ""
        out_lldp = ""
        out_arp = ""

        try:
            # Send terminal settings safely (whitelist verified)
            try:
                client.send_command("terminal length 0")
                client.send_command("terminal width 512")
            except Exception:
                pass

            # 1. Base command: show version (Always run for hostname, platform, OS)
            out_version = client.send_command("show version")

            # 2. CDP Neighbors (Always run for physical adjacency & spidering)
            out_cdp = client.send_command("show cdp neighbors detail")

            # 3. Optional LLDP Fallback (Only if enabled or CDP yields 0 / disabled)
            should_check_lldp = self.enable_lldp or (
                self.lldp_fallback_on_cdp_fail and (
                    not out_cdp or "%" in out_cdp or "CDP is not enabled" in out_cdp or "Device ID:" not in out_cdp
                )
            )
            if should_check_lldp:
                out_lldp = client.send_command("show lldp neighbors detail")

            # 4. Profile: Mapping & Intensive commands (physical connectivity, VLANs, IP assignments)
            if not is_discovery:
                out_ip_int = client.send_command("show ip interface brief")
                out_trunk = client.send_command("show interfaces trunk")
                if not out_trunk or "% Invalid input" in out_trunk or "Port" not in out_trunk:
                    out_trunk = client.send_command("show interfaces switchport")

                out_vlans = client.send_command("show vlan brief")
                if not out_vlans or "% Invalid input" in out_vlans:
                    out_vlans = client.send_command("show vlan")

            # 5. Profile: Intensive only commands (packet stats, routing table, ARP, descriptions)
            if not is_discovery and not is_mapping:
                out_intfs = client.send_command("show interfaces")
                out_routes = client.send_command("show ip route")
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
            ("show_cdp_neighbors_detail", out_cdp),
            ("show_lldp_neighbors_detail", out_lldp),
            ("show_ip_interface_brief", out_ip_int),
            ("show_interfaces", out_intfs),
            ("show_trunk_or_switchport", out_trunk),
            ("show_ip_route", out_routes),
            ("show_vlan", out_vlans),
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
        interfaces = parse_ip_interface_brief(out_ip_int) if out_ip_int else {}
        if out_intfs:
            interfaces = parse_interfaces_detail(out_intfs, interfaces)
        if out_trunk:
            interfaces = parse_switchport_or_trunk(out_trunk, interfaces)
            
        routes = parse_routes(out_routes) if out_routes else []
        vlans = parse_vlans(out_vlans) if out_vlans else []
        cdp_neighbors = parse_cdp_neighbors_detail(
            out_cdp,
            excluded_platform_patterns=self.excluded_platform_patterns,
            excluded_role_patterns=self.excluded_role_patterns,
        ) if out_cdp else []

        lldp_neighbors = parse_lldp_neighbors_detail(
            out_lldp,
            excluded_platform_patterns=self.excluded_platform_patterns,
            excluded_role_patterns=self.excluded_role_patterns,
        ) if out_lldp else []

        arp_table = parse_arp_table(out_arp) if out_arp else []

        role = self._determine_role(hostname, routes, interfaces, vlans, site_info)

        audit.log(
            event_type="DEVICE_DATA_COLLECTED",
            severity="INFO",
            device_ip=target_ip,
            hostname=hostname,
            details={
                "role": role.value,
                "platform": ver_data.get("platform"),
                "profile": self.crawl_profile,
                "hop_distance": current_hop,
                "credential_used": credential_used,
                "auth_time_ms": auth_time_ms,
                "interfaces_count": len(interfaces),
                "routes_count": len(routes),
                "vlans_count": len(vlans),
                "cdp_count": len(cdp_neighbors),
                "lldp_count": len(lldp_neighbors),
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
            credential_used=credential_used,
            auth_time_ms=auth_time_ms,
            hop_distance=current_hop,
            site_info=site_info,
            interfaces=interfaces,
            routes=routes,
            vlans=vlans,
            cdp_neighbors=cdp_neighbors,
            lldp_neighbors=lldp_neighbors,
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

        # Queue for discovery: entries are (target_ip, current_hop)
        active_futures: Dict[concurrent.futures.Future, Tuple[str, int]] = {}
        pending_targets: deque = deque()

        for seed in self.seed_devices:
            self.queued_targets.add(seed)
            pending_targets.append((seed, 0))

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            while pending_targets or active_futures:
                # Submit up to max_workers
                while pending_targets and len(active_futures) < self.max_workers:
                    target_ip, current_hop = pending_targets.popleft()
                    if target_ip in self.visited_ips:
                        continue
                    self.visited_ips.add(target_ip)
                    self._notify("crawl", f"Crawling device at {target_ip} (Hop {current_hop})...")
                    future = executor.submit(self._crawl_single_device, target_ip, current_hop)
                    active_futures[future] = (target_ip, current_hop)

                if not active_futures:
                    break

                # Wait for the next future to complete
                done, _ = concurrent.futures.wait(
                    active_futures.keys(),
                    return_when=concurrent.futures.FIRST_COMPLETED,
                )

                for future in done:
                    target_ip, current_hop = active_futures.pop(future)
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
                            hop_distance=current_hop,
                        )

                    if device.status == DeviceStatus.REACHABLE:
                        self.visited_hosts.add(device.hostname.lower())
                        reachable_devices.append(device)
                        self._notify(
                            "success",
                            f"Discovered {device.hostname} ({device.ip_address}) [Hop {current_hop}, {device.role.value}] - "
                            f"{len(device.interfaces)} intfs, {len(device.routes)} routes, "
                            f"{len(device.cdp_neighbors)} CDP, {len(getattr(device, 'lldp_neighbors', []))} LLDP"
                        )

                        # Process neighbors (CDP + LLDP if fallback discovered any)
                        all_neighbors = list(device.cdp_neighbors) + list(getattr(device, "lldp_neighbors", []))

                        if self.max_hops is not None and current_hop >= self.max_hops:
                            # Inspect neighbors to detect unvisited switches beyond the hop limit (e.g. at hop 11 when max_hops=10)
                            unvisited_boundary = []
                            for neighbor in all_neighbors:
                                if neighbor.is_ap or not neighbor.management_ip:
                                    continue
                                n_host = neighbor.destination_host.split(".")[0].strip().lower()
                                if (
                                    neighbor.management_ip not in self.visited_ips
                                    and neighbor.management_ip not in self.queued_targets
                                    and n_host not in self.visited_hosts
                                ):
                                    unvisited_boundary.append({
                                        "destination_host": neighbor.destination_host.split(".")[0].strip(),
                                        "management_ip": neighbor.management_ip,
                                        "local_interface": neighbor.local_interface,
                                        "remote_interface": neighbor.remote_interface,
                                        "platform": neighbor.platform,
                                    })

                            if unvisited_boundary:
                                device.is_reseed_frontier = True
                                device.boundary_neighbors = unvisited_boundary
                                self.reseed_points.append({
                                    "hostname": device.hostname,
                                    "ip_address": device.ip_address,
                                    "hop_distance": current_hop,
                                    "boundary_neighbors": unvisited_boundary,
                                })
                                audit.log(
                                    event_type="BOUNDARY_HOP_LIMIT_REACHED",
                                    severity="WARNING",
                                    device_ip=device.ip_address,
                                    hostname=device.hostname,
                                    details={
                                        "current_hop": current_hop,
                                        "max_hops": self.max_hops,
                                        "unvisited_boundary_count": len(unvisited_boundary),
                                        "unvisited_neighbors": unvisited_boundary,
                                        "action": "HALT_EXPANSION_REGISTER_RESEED_POINT",
                                    },
                                )
                                self._notify(
                                    "warning",
                                    f"Boundary reached at Hop {current_hop} for {device.hostname}. "
                                    f"Detected {len(unvisited_boundary)} unvisited neighbor(s) at Hop {current_hop + 1}. "
                                    f"Expansion halted safely; registered {device.hostname} ({device.ip_address}) as Reseed Frontier candidate."
                                )
                            else:
                                self._notify(
                                    "info",
                                    f"Reached max hop depth limit ({self.max_hops}) at {device.hostname}. "
                                    f"Discovered {len(all_neighbors)} neighbors (all already visited or non-switch endpoints)."
                                )
                        else:
                            for neighbor in all_neighbors:
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
                                    pending_targets.append((neighbor_ip, current_hop + 1))
                                    self._notify(
                                        "spider",
                                        f"Queued neighbor {neighbor_host} ({neighbor_ip}) at Hop {current_hop + 1} via {device.hostname}"
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
