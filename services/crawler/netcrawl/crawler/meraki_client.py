"""Read-only Cisco Meraki Dashboard API v1 enricher for the Network Crawler."""

from __future__ import annotations
import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from netcrawl.models import (
    CDPNeighbor,
    Device,
    DeviceRole,
    DeviceStatus,
    Interface,
    Route,
    SiteInfo,
    VLAN,
)

logger = logging.getLogger(__name__)

MERAKI_BASE_URL = "https://api.meraki.com/api/v1"

FORBIDDEN_PATH_SEGMENTS = (
    "/reboot",
    "/blinkleds",
    "/cycle",
    "/claim",
    "/unclaim",
    "/bind",
    "/unbind",
    "/provision",
    "/combine",
    "/split",
)


def normalize_mac_compact(mac: Optional[str]) -> str:
    """Normalize any MAC string to 12 lowercase hex characters ('683a1eaf84be')."""
    if not mac:
        return ""
    return re.sub(r"[^0-9a-f]", "", mac.lower())


def derive_meraki_site_info(
    org_id: str,
    network_name: str,
    device_name: str,
    model: str = "",
) -> SiteInfo:
    """
    Derive SiteInfo according to organizational architecture rules:
      - Cooper Health (905261): All endpoints are remote access / AutoVPN devices connected
        to the MX200/MX250 headend in the Wilmington Firewall DMZ -> grouped together under
        site='COOPER-AUTOVPN' (idf='dmz-headend' or 'autovpn-spokes').
      - Cape Regional / CRMC (262100): Switches and wireless APs are placed in their
        individual Hospital IDF ('2n', 'di', 'gs', 'ge', 'ct', 'lab2', 'peds', 'mso', etc.)
        or standalone clinic site ('CRPA-VD', 'CRPA-MARMORA', 'CRPA-SH', etc.) and never lumped together.
    """
    short_host = (device_name or model or "Meraki-Device").split(".")[0].strip()
    upper_name = short_host.upper()
    upper_net = (network_name or "").upper()
    upper_model = (model or "").upper()

    # 1. Cooper Health (905261) -> Single Unified AutoVPN Group
    if str(org_id) == "905261" or "COOPER" in upper_net:
        is_headend = upper_model.startswith(("MX250", "MX200", "MX450"))
        return SiteInfo(
            site="COOPER-AUTOVPN",
            idf="dmz-headend" if is_headend else "autovpn-spokes",
            role_code="rt" if is_headend else "vpn",
            iterator=None,
            raw_hostname=short_host,
        )

    # 2. Cape Regional Medical Center Hospital Campus (Individual IDFs)
    if upper_net == "CAPE REGIONAL MEDICAL CENTER" or "-MERAKI-STACK" in upper_name:
        idf = "mdf"
        m_stack = re.match(r"^([A-Z0-9]+)-MERAKI-STACK", upper_name)
        if m_stack:
            idf = m_stack.group(1).lower()
        elif upper_name.startswith("PEDS"):
            idf = "peds"
        elif "MSO" in upper_name or upper_name.startswith("PA("):
            idf = "mso"
        elif "CATHLAB" in upper_name or "CARDIO" in upper_name:
            idf = "cathlab"
        elif "MATERNITY" in upper_name:
            idf = "maternity"
        elif "MRI" in upper_name:
            idf = "mri"
        elif "WOUND" in upper_name:
            idf = "wound"
        elif upper_name.startswith("HIM"):
            idf = "him"
        elif "RIO" in upper_name:
            return SiteInfo(site="CRPA-RIO", idf="mdf", role_code="swas", raw_hostname=short_host)

        return SiteInfo(
            site="CRMC",
            idf=idf,
            role_code="swas",
            iterator=None,
            raw_hostname=short_host,
        )

    # 3. Cape Regional Physicians Associates (Individual Outpatient Buildings / Closets)
    if upper_net == "CAPE REGIONAL PHYSICIANS ASSOCIATES":
        if upper_name.startswith("VD_") or "VILLAGE DRIVE" in upper_name:
            return SiteInfo(site="CRMC", idf="vd", role_code="swas", raw_hostname=short_host)
        if "MEDCOM" in upper_name or "MED COMM" in upper_name:
            return SiteInfo(site="CRPA-MEDCOM", idf="mdf", role_code="swas", raw_hostname=short_host)
        if "CRPA-225" in upper_name or "(215)" in upper_name:
            return SiteInfo(site="CRPA-225", idf="mdf", role_code="swas", raw_hostname=short_host)
        if "GYN" in upper_name:
            return SiteInfo(site="CRPA-GYN", idf="mdf", role_code="swas", raw_hostname=short_host)
        if "PULMONARY" in upper_name:
            return SiteInfo(site="CRPA-PULM", idf="mdf", role_code="swas", raw_hostname=short_host)

    # 4. Standalone Cape Regional Clinic Networks
    if "MARMORA ORTHO" in upper_net:
        return SiteInfo(site="CRPA-MARM-ORTHO", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "MARMORA" in upper_net or "MARMORA" in upper_name:
        return SiteInfo(site="CRPA-MARMORA", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "STONE HARBOR" in upper_net or "STONEHARBOR" in upper_name:
        return SiteInfo(site="CRPA-STONEHARBOR", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "SEAVILLE" in upper_net or "SEAVILLE" in upper_name:
        return SiteInfo(site="CRPA-SEAVILLE", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "NORTH CAPE MAY" in upper_net or "NORTHCAPEMAY" in upper_name:
        return SiteInfo(site="CRPA-NCM", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "HAMMONTON" in upper_net:
        return SiteInfo(site="CRUC-HAMMONTON", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "URGENT CARE WW" in upper_net or upper_name.startswith("WWUC"):
        return SiteInfo(site="CRUC-WW", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "URGENT CARE CH" in upper_net or upper_name.startswith("CHUC"):
        return SiteInfo(site="CRUC-CH", idf="mdf", role_code="swas", raw_hostname=short_host)
    if "BRIGHTON" in upper_net:
        return SiteInfo(site="CRPA-BRIGHTON", idf="mdf", role_code="swas", raw_hostname=short_host)

    clean_site = re.sub(r"[^A-Z0-9\-]", "", upper_net[:12]) or "MERAKI"
    return SiteInfo(site=clean_site, idf="mdf", role_code="swas", raw_hostname=short_host)


_SHARED_GET_CACHE: Dict[str, Tuple[float, Any]] = {}
_SHARED_CACHE_LOCK = threading.Lock()
_MERAKI_CACHE_TTL_SEC = 720.0  # 12-minute shared cache (2m overlap buffer over the 10-minute background poller)


class MerakiCrawlerEnricher:
    """Thread-safe, strictly read-only Meraki API client for resolving Meraki switches during crawls."""

    def __init__(self, api_key: Optional[str] = None, cache_ttl_sec: float = _MERAKI_CACHE_TTL_SEC) -> None:
        self.api_key = api_key or self._load_api_key()
        self.cache_ttl_sec = cache_ttl_sec
        self._lock = threading.Lock()
        self._last_req_ts = 0.0
        self._initialized = False
        self.by_ip: Dict[str, Dict[str, Any]] = {}
        self.by_mac: Dict[str, Dict[str, Any]] = {}
        self.by_serial: Dict[str, Dict[str, Any]] = {}
        self.by_name: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def _load_api_key() -> Optional[str]:
        env_val = os.environ.get("MERAKI_API_KEY", "").strip()
        if len(env_val) > 10:
            return env_val

        # Walk up to workspace root looking for .env
        curr = Path(__file__).resolve()
        for parent in [curr.parent, *curr.parents]:
            env_file = parent / ".env"
            if env_file.is_file():
                try:
                    for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                        s = line.strip()
                        if s.startswith("MERAKI_API_KEY="):
                            val = s[len("MERAKI_API_KEY="):].strip().strip("\"'")
                            if len(val) > 10:
                                return val
                except Exception:
                    pass
        return None

    @property
    def is_enabled(self) -> bool:
        return bool(self.api_key and len(self.api_key) > 10)

    def _get_json(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Strictly read-only HTTP GET request with rate limiting and 429 Retry-After handling."""
        if not self.is_enabled:
            return None

        path_clean = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        lower_path = path_clean.lower()
        for forbidden in FORBIDDEN_PATH_SEGMENTS:
            if forbidden in lower_path:
                raise PermissionError(f"READ_ONLY_VIOLATION: Forbidden Meraki path '{path_clean}'")

        url = f"{MERAKI_BASE_URL}{path_clean}"
        if params:
            query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            if query:
                url = f"{url}?{query}"

        if self.cache_ttl_sec > 0:
            with _SHARED_CACHE_LOCK:
                cached = _SHARED_GET_CACHE.get(url)
                if cached and cached[0] > time.time():
                    return cached[1]

        for attempt in range(3):
            with self._lock:
                elapsed = time.time() - self._last_req_ts
                if elapsed < 0.14:
                    time.sleep(0.14 - elapsed)
                self._last_req_ts = time.time()

            req = urllib.request.Request(
                url,
                method="GET",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Accept": "application/json",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=12) as resp:
                    parsed = json.loads(resp.read().decode("utf-8"))
                    if self.cache_ttl_sec > 0:
                        with _SHARED_CACHE_LOCK:
                            _SHARED_GET_CACHE[url] = (time.time() + self.cache_ttl_sec, parsed)
                    return parsed
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 2:
                    retry_after = float(e.headers.get("Retry-After", "2") or 2)
                    time.sleep(min(max(retry_after, 1.0), 8.0))
                    continue
                return None
            except Exception:
                return None
        return None

    def ensure_inventory_loaded(self) -> None:
        if not self.is_enabled or self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            self._initialized = True

        orgs = self._get_json("/organizations") or []
        for org in orgs:
            org_id = str(org.get("id", ""))
            org_name = str(org.get("name", ""))
            if not org_id:
                continue

            nets = self._get_json(f"/organizations/{org_id}/networks", {"perPage": 1000}) or []
            devs = self._get_json(f"/organizations/{org_id}/devices", {"perPage": 1000}) or []
            statuses = self._get_json(f"/organizations/{org_id}/devices/statuses", {"perPage": 1000}) or []

            net_map = {str(n.get("id")): str(n.get("name") or n.get("id")) for n in nets if n.get("id")}
            status_map = {str(s.get("serial")): s for s in statuses if s.get("serial")}

            for d in devs:
                serial = str(d.get("serial") or "").strip()
                if not serial:
                    continue
                st = status_map.get(serial, {})
                net_id = str(d.get("networkId") or st.get("networkId") or "")
                net_name = net_map.get(net_id, net_id)
                model = str(d.get("model") or st.get("model") or "")
                raw_name = str(d.get("name") or st.get("name") or "").strip()
                name = raw_name or (f"{net_name} ({model})" if net_name else serial)
                lan_ip = d.get("lanIp") or st.get("lanIp")
                mac_raw = d.get("mac") or st.get("mac")
                mac_compact = normalize_mac_compact(mac_raw)

                record = {
                    "serial": serial,
                    "name": name,
                    "raw_name": raw_name,
                    "model": model,
                    "productType": str(d.get("productType") or st.get("productType") or "switch"),
                    "mac": mac_raw,
                    "macCompact": mac_compact,
                    "lanIp": lan_ip,
                    "networkId": net_id,
                    "networkName": net_name,
                    "organizationId": org_id,
                    "organizationName": org_name,
                    "status": str(st.get("status") or "online").lower(),
                    "firmware": d.get("firmware"),
                }

                self.by_serial[serial.upper()] = record
                if lan_ip:
                    self.by_ip[str(lan_ip).strip()] = record
                if mac_compact:
                    self.by_mac[mac_compact] = record
                if raw_name:
                    self.by_name[raw_name.lower()] = record

    def lookup(self, ip_or_id: Optional[str], hostname_or_mac: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not self.is_enabled:
            return None
        self.ensure_inventory_loaded()

        for candidate in (ip_or_id, hostname_or_mac):
            if not candidate:
                continue
            c = candidate.strip()
            if c.upper().startswith("MERAKI:"):
                ser_key = c.split(":", 1)[1].strip().upper()
                if ser_key in self.by_serial:
                    return self.by_serial[ser_key]
            if c in self.by_ip:
                return self.by_ip[c]
            if c.upper() in self.by_serial:
                return self.by_serial[c.upper()]
            if c.lower() in self.by_name:
                return self.by_name[c.lower()]
            hex_only = normalize_mac_compact(c)
            if len(hex_only) == 12 and hex_only in self.by_mac:
                return self.by_mac[hex_only]
        return None

    def build_crawler_device(
        self,
        record: Dict[str, Any],
        target_ip: str,
        discovered_via: Optional[str],
        current_hop: int,
    ) -> Device:
        """Fetch live switchports, VLANs, L3 SVIs, and CDP/LLDP neighbors from Meraki API and return a Device."""
        t0 = time.time()
        serial = record["serial"]
        product_type = record.get("productType", "switch")
        hostname = record["name"]
        ip_addr = record.get("lanIp") or target_ip

        interfaces: Dict[str, Interface] = {}
        vlans_map: Dict[int, VLAN] = {}
        cdp_neighbors: List[CDPNeighbor] = []
        lldp_neighbors: List[CDPNeighbor] = []
        routes: List[Route] = []

        if product_type == "switch":
            raw_ports = self._get_json(f"/devices/{serial}/switch/ports") or []
            raw_statuses = self._get_json(f"/devices/{serial}/switch/ports/statuses") or []
            raw_lldp_cdp = self._get_json(f"/devices/{serial}/lldpCdp") or {}
            raw_svis = self._get_json(f"/devices/{serial}/switch/routing/interfaces") or []

            try:
                from netcrawl.audit.logger import get_audit_logger
                audit = get_audit_logger()
                audit.archive_command_response(
                    snapshot_id=None,
                    device_hostname=hostname,
                    device_ip=str(ip_addr),
                    command="meraki_api_switch_ports_and_lldp_cdp",
                    response_output=json.dumps(
                        {
                            "serial": serial,
                            "ports_count": len(raw_ports),
                            "statuses_count": len(raw_statuses),
                            "lldp_cdp": raw_lldp_cdp,
                            "routed_interfaces": raw_svis,
                        },
                        indent=2,
                    ),
                )
            except Exception:
                pass

            status_by_port = {str(s.get("portId")): s for s in raw_statuses if s.get("portId") is not None}
            nb_ports = (raw_lldp_cdp or {}).get("ports") or {}

            for cfg in raw_ports:
                pid = str(cfg.get("portId", ""))
                if not pid:
                    continue
                st = status_by_port.get(pid, {})
                nb = nb_ports.get(pid, {})

                intf_name = f"Port{pid}"
                enabled = bool(cfg.get("enabled", True))
                st_str = str(st.get("status") or "").lower()
                oper = "up" if st_str == "connected" else (" administratively down" if not enabled else "down")
                is_trunk = str(cfg.get("type") or "").lower() == "trunk"
                vlan_id = cfg.get("vlan")

                interfaces[intf_name] = Interface(
                    name=intf_name,
                    speed=st.get("speed"),
                    duplex=st.get("duplex"),
                    admin_status="up" if enabled else "down",
                    oper_status=oper,
                    status=oper,
                    is_svi=False,
                    is_trunk=is_trunk,
                    access_vlan=int(vlan_id) if vlan_id is not None and not is_trunk else None,
                    allowed_vlans=str(cfg.get("allowedVlans") or "all") if is_trunk else None,
                    description=cfg.get("name"),
                )

                if vlan_id is not None:
                    try:
                        vid = int(vlan_id)
                        if vid not in vlans_map:
                            vlans_map[vid] = VLAN(vlan_id=vid, name=f"VLAN{vid:04d}", status="active", ports=[])
                        vlans_map[vid].ports.append(intf_name)
                    except Exception:
                        pass

                # Extract CDP & LLDP neighbors
                cdp_raw = st.get("cdp") or nb.get("cdp")
                lldp_raw = st.get("lldp") or nb.get("lldp")

                if cdp_raw:
                    dev_id = str(cdp_raw.get("deviceId") or cdp_raw.get("systemName") or "").strip()
                    mgmt_ip = cdp_raw.get("address") or cdp_raw.get("managementAddress")
                    platform_str = str(cdp_raw.get("platform") or "Meraki/Cisco")
                    rem_port = str(cdp_raw.get("portId") or cdp_raw.get("sourcePort") or "unknown")

                    # Resolve neighbor against Meraki inventory if dev_id is a MAC address
                    matched_meraki = self.lookup(mgmt_ip, dev_id)
                    if matched_meraki:
                        dev_id = matched_meraki["name"]
                        mgmt_ip = matched_meraki.get("lanIp") or mgmt_ip
                        platform_str = f"Meraki {matched_meraki.get('model', '')}".strip()

                    is_ap = any(k in platform_str.upper() for k in ("MR", "AIR-", "AP", "C91")) or (
                        matched_meraki and matched_meraki.get("productType") == "wireless"
                    )
                    if dev_id:
                        cdp_neighbors.append(
                            CDPNeighbor(
                                destination_host=dev_id,
                                management_ip=mgmt_ip,
                                local_interface=intf_name,
                                remote_interface=rem_port,
                                platform=platform_str,
                                capabilities=["Switch"],
                                is_ap=bool(is_ap),
                            )
                        )

                if lldp_raw and not cdp_raw:
                    sys_name = str(lldp_raw.get("systemName") or lldp_raw.get("chassisId") or "").strip()
                    mgmt_ip = lldp_raw.get("managementAddress")
                    sys_desc = str(lldp_raw.get("systemDescription") or "LLDP Neighbor")
                    rem_port = str(lldp_raw.get("portId") or lldp_raw.get("sourcePort") or "unknown")

                    matched_meraki = self.lookup(mgmt_ip, sys_name)
                    if matched_meraki:
                        sys_name = matched_meraki["name"]
                        mgmt_ip = matched_meraki.get("lanIp") or mgmt_ip
                        sys_desc = f"Meraki {matched_meraki.get('model', '')}".strip()

                    is_ap = any(k in sys_desc.upper() for k in ("MR", "AIR-", "WIRELESS AP")) or (
                        matched_meraki and matched_meraki.get("productType") == "wireless"
                    )
                    if sys_name:
                        lldp_neighbors.append(
                            CDPNeighbor(
                                destination_host=sys_name,
                                management_ip=mgmt_ip,
                                local_interface=intf_name,
                                remote_interface=rem_port,
                                platform=sys_desc,
                                capabilities=["Switch"],
                                is_ap=bool(is_ap),
                            )
                        )

            for svi in raw_svis:
                vid = svi.get("vlanId")
                svi_name = f"Vlan{vid}" if vid else str(svi.get("name") or "Vlan1")
                svi_ip = svi.get("interfaceIp")
                subnet_cidr = str(svi.get("subnet") or "")
                interfaces[svi_name] = Interface(
                    name=svi_name,
                    ip_address=svi_ip,
                    cidr=subnet_cidr,
                    admin_status="up",
                    oper_status="up",
                    status="up",
                    is_svi=True,
                    description=svi.get("name"),
                )
                if svi.get("defaultGateway"):
                    routes.append(
                        Route(
                            prefix="0.0.0.0",
                            netmask="0.0.0.0",
                            cidr="0.0.0.0/0",
                            protocol="S",
                            next_hop=str(svi.get("defaultGateway")),
                            outgoing_interface=svi_name,
                        )
                    )

        elapsed_ms = int((time.time() - t0) * 1000)
        site_info = derive_meraki_site_info(
            org_id=record["organizationId"],
            network_name=record["networkName"],
            device_name=hostname,
            model=record["model"],
        )

        role = (
            DeviceRole.ROUTER
            if product_type == "appliance"
            else (DeviceRole.L3_SWITCH if routes else DeviceRole.L2_SWITCH)
        )

        return Device(
            hostname=hostname,
            ip_address=str(ip_addr),
            platform=f"Meraki {record['model']}".strip(),
            os_version=record.get("firmware") or "Meraki Cloud OS",
            serial_number=serial,
            role=role,
            status=DeviceStatus.REACHABLE if record.get("status") in ("online", "alerting") else DeviceStatus.UNREACHABLE,
            discovered_via=discovered_via,
            credential_used="Meraki API",
            auth_time_ms=elapsed_ms,
            hop_distance=current_hop,
            site_info=site_info,
            interfaces=interfaces,
            routes=routes,
            vlans=list(vlans_map.values()),
            cdp_neighbors=cdp_neighbors,
            lldp_neighbors=lldp_neighbors,
            protocol="meraki_api",
        )
