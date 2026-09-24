"""Resilient parsers for Cisco IOS command outputs."""

from __future__ import annotations
import ipaddress
import re
from typing import Any, Dict, List, Optional, Tuple

from netcrawl.models import (
    ARPEntry,
    CDPNeighbor,
    EIGRPNeighbor,
    Interface,
    Route,
    SiteInfo,
    VLAN,
)


def normalize_interface(name: str) -> str:
    """Standardize interface names across Cisco abbreviations."""
    if not name:
        return ""
    name = name.strip()
    match = re.match(r"^([A-Za-z\-]+)\s*([0-9\/\.\:]+)$", name)
    if not match:
        return name
    prefix, port_id = match.group(1).lower(), match.group(2)
    if prefix in ["gi", "gig", "gigabit", "gigabitethernet"]:
        return f"GigabitEthernet{port_id}"
    if prefix in ["te", "tengig", "tengigabit", "tengigabitethernet"]:
        return f"TenGigabitEthernet{port_id}"
    if prefix in ["fa", "fast", "fastethernet"]:
        return f"FastEthernet{port_id}"
    if prefix in ["eth", "ethernet"]:
        return f"Ethernet{port_id}"
    if prefix in ["fo", "fortygige", "fortygigabitethernet"]:
        return f"FortyGigabitEthernet{port_id}"
    if prefix in ["hu", "hundredgige", "hundredgigabitethernet"]:
        return f"HundredGigE{port_id}"
    if prefix in ["po", "port", "port-channel"]:
        return f"Port-channel{port_id}"
    if prefix in ["vl", "vlan"]:
        return f"Vlan{port_id}"
    if prefix in ["lo", "loopback"]:
        return f"Loopback{port_id}"
    if prefix in ["mgmt", "management"]:
        return f"mgmt{port_id}"
    return name


def parse_site_info(hostname: str, pattern: Optional[str] = None) -> Optional[SiteInfo]:
    """
    Parse site code and IDF container from device hostname.
    Rule:
      - Site: First 3 characters of switch name (e.g. 101, HSP, CAM)
      - IDF: Next 3 characters after the first hyphen '-' (e.g. 2mc, mdf, id1)
    """
    if not hostname:
        return None
    
    # Strip domain suffix if present (e.g. 101-mdf-swcs-1.corp.local -> 101-mdf-swcs-1)
    short_host = hostname.split(".")[0].strip()
    if len(short_host) < 3:
        return None

    site = short_host[:3].upper()
    idf = "mdf"
    role_code = None
    iterator = None

    if "-" in short_host:
        parts = short_host.split("-")
        if len(parts) > 1 and parts[1]:
            idf = parts[1][:3].lower()
        if len(parts) > 2:
            role_code = parts[2].lower()
        if len(parts) > 3:
            iterator = parts[3]

    # Optional pattern override
    if pattern:
        try:
            match = re.match(pattern, short_host)
            if match:
                data = match.groupdict()
                if "site" in data and data["site"]:
                    site = data["site"].upper()
                if "idf" in data and data["idf"]:
                    idf = data["idf"].lower()
                if "role" in data:
                    role_code = data["role"].lower()
                if "iter" in data:
                    iterator = data["iter"]
        except Exception:
            pass

    return SiteInfo(
        site=site,
        idf=idf,
        role_code=role_code,
        iterator=iterator,
        raw_hostname=short_host,
    )


def parse_version(output: str) -> Dict[str, Any]:
    """Parse 'show version' output for hostname, platform, OS version, and serial number across Cisco IOS and NX-OS."""
    info: Dict[str, Any] = {
        "hostname": None,
        "platform": None,
        "os_version": None,
        "serial_number": None,
    }
    
    # OS Version (IOS / IOS-XE / NX-OS)
    nx_ver = re.search(r"(?:NX-OS|system):\s*version\s*([0-9a-zA-Z\.\(\):]+)", output, re.IGNORECASE)
    if nx_ver:
        info["os_version"] = f"NX-OS {nx_ver.group(1).strip()}"
    else:
        ver_match = re.search(
            r"(?:Cisco IOS Software|IOS \(tm\))\s+([^\n,]+),?\s+(?:Version\s+)?([0-9a-zA-Z\.\(\):]+)",
            output,
            re.IGNORECASE,
        )
        if ver_match:
            info["os_version"] = f"{ver_match.group(1).strip()} {ver_match.group(2).strip()}"
        else:
            ver_alt = re.search(r"Version\s+([0-9a-zA-Z\.\(\):]+)", output, re.IGNORECASE)
            if ver_alt:
                info["os_version"] = ver_alt.group(1).strip()

    # Platform/Model (IOS: WS-C..., C9..., ISR...; NX-OS: Nexus 9000, N9K-..., Nexus...)
    nexus_match = re.search(
        r"(?:cisco\s+)?(Nexus\s*[0-9]{3,5}[A-Za-z0-9\-]*(?:\s+[0-9a-zA-Z\-]+)?|N[3579]K-[0-9a-zA-Z-]+)\s*(?:Chassis)?",
        output,
        re.IGNORECASE,
    )
    if nexus_match:
        info["platform"] = f"cisco {nexus_match.group(1).strip()}"
    else:
        model_match = re.search(
            r"(?:cisco|Model number|System Serial Number:)\s*[:\s]?\s*(WS-C[0-9a-zA-Z-]+|C[0-9a-zA-Z-]+|ISR[0-9a-zA-Z-]+|ASR[0-9a-zA-Z-]+|CSR[0-9a-zA-Z-]+|[0-9]{4})",
            output,
            re.IGNORECASE,
        )
        if model_match:
            info["platform"] = model_match.group(1).strip()

    # Serial Number
    serial_match = re.search(
        r"(?:System Serial Number|Processor board ID|System serial number|Chassis ID)\s*[:=]?\s*([A-Za-z0-9]+)",
        output,
        re.IGNORECASE,
    )
    if serial_match:
        info["serial_number"] = serial_match.group(1).strip()

    # Hostname (IOS: "Router uptime is...", NX-OS: "Device name: switch-01", "Host Name: switch-01")
    nx_host_match = re.search(r"(?:Device name|Host\s*Name)\s*:\s*([a-zA-Z0-9\-_]+)", output, re.IGNORECASE)
    if nx_host_match:
        info["hostname"] = nx_host_match.group(1).strip()
    else:
        host_match = re.search(r"^([a-zA-Z0-9\-_]+)\s+uptime\s+is", output, re.MULTILINE | re.IGNORECASE)
        if host_match:
            info["hostname"] = host_match.group(1).strip()

    return info


def parse_ip_interface_brief(output: str) -> Dict[str, Interface]:
    """Parse 'show ip interface brief' for both Cisco IOS and NX-OS."""
    interfaces: Dict[str, Interface] = {}
    lines = output.splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith("Interface") or line.startswith("---") or line.startswith("IP Interface Status"):
            continue
        parts = line.split()
        if len(parts) >= 3:
            raw_name = parts[0]
            norm_name = normalize_interface(raw_name)
            ip_addr = parts[1] if parts[1].lower() not in ["unassigned", "--"] else None
            
            # Check for NX-OS format: "protocol-up/link-up/admin-up"
            status_candidate = parts[-1].lower()
            if "/" in status_candidate and ("up" in status_candidate or "down" in status_candidate):
                admin_status = "administratively down" if "admin-down" in status_candidate else "up"
                oper_status = "up" if ("link-up" in status_candidate or "protocol-up" in status_candidate) else "down"
            elif len(parts) >= 5:
                # Cisco IOS format
                if "administratively down" in line.lower():
                    admin_status = "administratively down"
                    oper_status = parts[-1].lower()
                else:
                    admin_status = parts[-2].lower()
                    oper_status = parts[-1].lower()
            else:
                admin_status = parts[-1].lower()
                oper_status = parts[-1].lower()
            
            is_svi = norm_name.lower().startswith("vlan")
            
            interfaces[norm_name] = Interface(
                name=norm_name,
                ip_address=ip_addr,
                admin_status=admin_status,
                oper_status=oper_status,
                is_svi=is_svi,
            )
    return interfaces


def parse_interfaces_detail(output: str, current_interfaces: Dict[str, Interface]) -> Dict[str, Interface]:
    """Parse 'show interfaces' to extract speed, duplex, MAC address, and description."""
    # Split by interface header
    blocks = re.split(r"\n(?=[A-Za-z0-9\/\.\-]+ is (?:up|down|administratively down))", output)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        first_line = block.splitlines()[0]
        header_match = re.match(r"^([A-Za-z0-9\/\.\-]+)\s+is\s+([^,]+),\s+line\s+protocol\s+is\s+([a-zA-Z]+)", first_line)
        if not header_match:
            continue
        raw_name = header_match.group(1)
        norm_name = normalize_interface(raw_name)
        
        # MAC address
        mac_match = re.search(r"address is\s+([0-9a-fA-F\.]+)", block)
        mac = mac_match.group(1) if mac_match else None
        
        # Duplex and Speed
        duplex_speed_match = re.search(r"([A-Za-z\-]+)[ -]duplex,\s+([0-9A-Za-z\/\-]+b\/s|[0-9]+ [A-Za-z]+)", block, re.IGNORECASE)
        duplex = duplex_speed_match.group(1) if duplex_speed_match else None
        speed = duplex_speed_match.group(2) if duplex_speed_match else None
        
        # Description
        desc_match = re.search(r"Description:\s+(.*)", block)
        desc = desc_match.group(1).strip() if desc_match else None
        
        # IP Address with mask if present
        ip_mask_match = re.search(r"Internet address is\s+([0-9\.]+)\/([0-9]+)", block)
        ip = ip_mask_match.group(1) if ip_mask_match else None
        cidr = f"/{ip_mask_match.group(2)}" if ip_mask_match else None

        if norm_name in current_interfaces:
            intf = current_interfaces[norm_name]
            if mac:
                intf.mac_address = mac
            if duplex:
                intf.duplex = duplex
            if speed:
                intf.speed = speed
            if desc:
                intf.description = desc
            if ip and not intf.ip_address:
                intf.ip_address = ip
                intf.cidr = cidr
        else:
            current_interfaces[norm_name] = Interface(
                name=norm_name,
                ip_address=ip,
                cidr=cidr,
                mac_address=mac,
                duplex=duplex,
                speed=speed,
                description=desc,
                admin_status=header_match.group(2).strip().lower(),
                oper_status=header_match.group(3).strip().lower(),
                is_svi=norm_name.lower().startswith("vlan"),
            )
            
    return current_interfaces


def parse_interfaces_description(output: str, current_interfaces: Dict[str, Interface]) -> Dict[str, Interface]:
    """Parse 'show interfaces description' across Cisco IOS and NX-OS formats."""
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("Interface") or line.startswith("Port") or line.startswith("---") or line.startswith("=="):
            continue

        # 1. IOS format: GigabitEthernet1/0/1 up up Description text
        m = re.match(
            r"^([A-Za-z0-9\/\.\-]+)\s+(up|down|admin down|administratively down)\s+(up|down)\s*(.*)$",
            line,
            re.IGNORECASE,
        )
        if m:
            raw_name = m.group(1)
            norm_name = normalize_interface(raw_name)
            desc = m.group(4).strip() if m.group(4) else None
            admin_st = m.group(2).strip().lower()
            oper_st = m.group(3).strip().lower()

            if norm_name in current_interfaces:
                if desc:
                    current_interfaces[norm_name].description = desc
            else:
                current_interfaces[norm_name] = Interface(
                    name=norm_name,
                    description=desc,
                    admin_status=admin_st,
                    oper_status=oper_st,
                    is_svi=norm_name.lower().startswith("vlan"),
                )
            continue

        # 2. NX-OS format:
        # Port          Type   Speed    Description
        # mgmt0         --     --       OOB-MGMT
        # Eth1/1        eth    10G      TRUNK-TO-CORE-01
        # Po1           eth    40G      VPC-PEER-LINK
        # OR:
        # Port          Status Description
        # Eth1/1        up     TRUNK-TO-CORE-01
        nx_match = re.match(
            r"^([A-Za-z0-9\/\.\-]+)\s+(?:(?:eth|fc|--|[0-9]+[GMK]?)\s+(?:[0-9]+[GMK]?|auto|--)\s+|up\s+|down\s+)(.+)$",
            line,
            re.IGNORECASE,
        )
        if nx_match:
            raw_name = nx_match.group(1)
            norm_name = normalize_interface(raw_name)
            desc = nx_match.group(2).strip()
            if desc in ["--", "none"]:
                desc = None
            if norm_name in current_interfaces:
                if desc:
                    current_interfaces[norm_name].description = desc
            else:
                current_interfaces[norm_name] = Interface(
                    name=norm_name,
                    description=desc,
                    admin_status="up",
                    oper_status="up",
                    is_svi=norm_name.lower().startswith("vlan"),
                )

    return current_interfaces



def parse_switchport_or_trunk(output: str, interfaces: Dict[str, Interface]) -> Dict[str, Interface]:
    """Parse 'show interfaces switchport' or 'show interfaces trunk' to determine trunk/access mode for IOS and NX-OS."""
    # Check if 'show interfaces trunk' format (IOS: Port Mode Encapsulation; NX-OS: Port Native Vlan Status)
    if "Port" in output and ("Mode" in output or "Native" in output or "trunking" in output.lower()):
        # Trunk output format
        in_trunk_table = False
        in_allowed_table = False
        allowed_map: Dict[str, str] = {}
        for line in output.splitlines():
            line = line.strip()
            if not line or line.startswith("---") or line.startswith("=="):
                continue
            if line.startswith("Port") and ("Mode" in line or "Native" in line or "Status" in line):
                in_trunk_table = True
                in_allowed_table = False
                continue
            if line.startswith("Port") and re.search(r"Vlans allowed on trunk", line, re.IGNORECASE):
                in_trunk_table = False
                in_allowed_table = True
                continue
            if in_trunk_table:
                parts = line.split()
                if len(parts) >= 2 and (any(m in line.lower() for m in ["on", "desirable", "auto", "trunking"])):
                    norm_name = normalize_interface(parts[0])
                    if norm_name in interfaces:
                        interfaces[norm_name].is_trunk = True
            elif in_allowed_table:
                parts = line.split()
                if len(parts) >= 2:
                    norm_name = normalize_interface(parts[0])
                    allowed_map[norm_name] = parts[1]
                    if norm_name in interfaces:
                        interfaces[norm_name].is_trunk = True
                        interfaces[norm_name].allowed_vlans = parts[1]
    else:
        # 'show interfaces switchport' format
        blocks = re.split(r"\n(?=Name:\s+[A-Za-z0-9\/\.\-]+)", output)
        for block in blocks:
            name_match = re.search(r"Name:\s+([A-Za-z0-9\/\.\-]+)", block)
            if not name_match:
                continue
            norm_name = normalize_interface(name_match.group(1))
            mode_match = re.search(r"Administrative Mode:\s+(.*)", block)
            oper_mode_match = re.search(r"Operational Mode:\s+(.*)", block)
            access_vlan_match = re.search(r"Access Mode VLAN:\s+([0-9]+)", block)
            trunk_vlans_match = re.search(r"Trunking VLANs (?:Enabled|Allowed):\s+(.*)", block, re.IGNORECASE)
            
            mode_str = (oper_mode_match.group(1) if oper_mode_match else (mode_match.group(1) if mode_match else "")).lower()
            is_trunk = "trunk" in mode_str
            
            if norm_name in interfaces:
                interfaces[norm_name].is_trunk = is_trunk
                if access_vlan_match:
                    try:
                        interfaces[norm_name].access_vlan = int(access_vlan_match.group(1))
                    except ValueError:
                        pass
                if trunk_vlans_match:
                    interfaces[norm_name].allowed_vlans = trunk_vlans_match.group(1).strip()
    return interfaces


def parse_routes(output: str) -> List[Route]:
    """Parse 'show ip route' output."""
    routes: List[Route] = []
    lines = output.splitlines()
    
    # Common route line regex:
    # Code [S/O/D/B/C/L/R/i] prefix/mask [admin/metric] via next_hop, outgoing_intf
    # Example: C        10.10.1.0/24 is directly connected, Vlan10
    # Example: S        0.0.0.0/0 [1/0] via 10.100.1.254, GigabitEthernet0/0
    # Example: O        10.20.2.0/24 [110/2] via 10.100.1.2, 00:15:20, GigabitEthernet0/1
    # Example: O E2     0.0.0.0/0 [110/1] via 192.168.1.1, 00:01:00, GigabitEthernet0/0
    
    current_net: Optional[str] = None
    
    route_regex = re.compile(
        r"^(?P<proto>[A-Z\*\s]{1,5})\s+"
        r"(?P<prefix>[0-9\.]+(?:\/[0-9]+)?)"
        r"(?:\s+\[(?P<ad>[0-9]+)\/(?P<metric>[0-9]+)\])?"
        r"(?:\s+(?:is directly connected,|via)\s+(?P<via>[0-9\.]+))?"
        r"(?:.*?(?:,\s+|\s+)(?P<intf>[A-Za-z0-9\/\.\-]+))?$",
        re.MULTILINE
    )

    for line in lines:
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("Codes:") or line_clean.startswith("Gateway of"):
            continue
        
        # Handle subnet header: "10.0.0.0/8 is variably subnetted, 4 subnets, 2 masks"
        subnet_hdr = re.match(r"^([0-9\.]+/[0-9]+)\s+is variably subnetted", line_clean)
        if subnet_hdr:
            continue

        # Directly connected format:
        # C        10.10.1.0/24 is directly connected, Vlan10
        direct_match = re.match(
            r"^([A-Z\*]{1,3})\s+([0-9\.]+/[0-9]+)\s+is directly connected,\s+([A-Za-z0-9\/\.\-]+)",
            line_clean
        )
        if direct_match:
            proto = direct_match.group(1).strip()
            cidr_prefix = direct_match.group(2).strip()
            out_intf = normalize_interface(direct_match.group(3).strip())
            try:
                net = ipaddress.ip_network(cidr_prefix, strict=False)
                routes.append(Route(
                    prefix=str(net.network_address),
                    netmask=str(net.netmask),
                    cidr=f"/{net.prefixlen}",
                    protocol=proto,
                    next_hop="DIRECTLY_CONNECTED",
                    outgoing_interface=out_intf,
                    metric=0,
                    admin_distance=0,
                ))
            except ValueError:
                pass
            continue

        # Via next hop format:
        # S        0.0.0.0/0 [1/0] via 10.100.1.254, GigabitEthernet0/0
        # O        10.20.2.0/24 [110/2] via 10.100.1.2, 00:15:20, GigabitEthernet0/1
        via_match = re.match(
            r"^([A-Z\*]{1,3}(?:\s+[A-Z0-9]+)?)\s+([0-9\.]+(?:/[0-9]+)?)\s+\[([0-9]+)/([0-9]+)\]\s+via\s+([0-9\.]+)(?:,\s*(?:[0-9a-zA-Z:]+,\s*)?([A-Za-z0-9\/\.\-]+))?",
            line_clean
        )
        if via_match:
            proto = via_match.group(1).strip()
            prefix_str = via_match.group(2).strip()
            ad = int(via_match.group(3))
            metric = int(via_match.group(4))
            next_hop = via_match.group(5).strip()
            out_intf = normalize_interface(via_match.group(6)) if via_match.group(6) else None
            
            # If prefix didn't have CIDR, assume /32 or classful
            if "/" not in prefix_str:
                prefix_str = f"{prefix_str}/32"
            
            try:
                net = ipaddress.ip_network(prefix_str, strict=False)
                routes.append(Route(
                    prefix=str(net.network_address),
                    netmask=str(net.netmask),
                    cidr=f"/{net.prefixlen}",
                    protocol=proto,
                    next_hop=next_hop,
                    outgoing_interface=out_intf,
                    metric=metric,
                    admin_distance=ad,
                ))
            except ValueError:
                pass
            continue

    return routes


def parse_vlans(output: str) -> List[VLAN]:
    """Parse 'show vlan brief' or 'show vlan'."""
    vlans: List[VLAN] = []
    lines = output.splitlines()
    for line in lines:
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("VLAN") or line_clean.startswith("----"):
            continue
        
        # Regex for: 10   DATA                             active    Gi1/0/3, Gi1/0/4
        match = re.match(r"^([0-9]+)\s+([a-zA-Z0-9_\-]+)\s+([a-zA-Z\/]+)(?:\s+(.*))?$", line_clean)
        if match:
            vlan_id = int(match.group(1))
            vlan_name = match.group(2)
            status = match.group(3)
            raw_ports = match.group(4) if match.group(4) else ""
            ports = [normalize_interface(p.strip()) for p in raw_ports.split(",") if p.strip()]
            vlans.append(VLAN(
                vlan_id=vlan_id,
                name=vlan_name,
                status=status,
                ports=ports,
            ))
    return vlans


def parse_cdp_neighbors_detail(
    output: str,
    excluded_platform_patterns: Optional[List[str]] = None,
    excluded_role_patterns: Optional[List[str]] = None,
) -> List[CDPNeighbor]:
    """
    Parse 'show cdp neighbors detail'.
    Identifies if a neighbor is a Wireless AP, Phone, or Switch/Router.
    Filters out APs from the crawl queue while retaining neighbor data.
    """
    neighbors: List[CDPNeighbor] = []
    blocks = re.split(r"-------------------------+", output)
    
    if excluded_platform_patterns is None:
        excluded_platform_patterns = [
            r"(?i)AIR-",
            r"(?i)C91[0-9]{2}",
            r"(?i)AP-cos",
            r"(?i)Aironet",
            r"(?i)IP Phone",
            r"(?i)Cisco IP",
        ]
        
    for block in blocks:
        block = block.strip()
        if not block or "Device ID:" not in block:
            continue
        
        # Destination host
        dev_id_match = re.search(r"Device ID:\s*([^\n\r,]+)", block, re.IGNORECASE)
        if not dev_id_match:
            continue
        dest_host = dev_id_match.group(1).strip()
        
        # IP address (can appear under "Entry address(es): \n IP address: 10.1.1.1" or "IPv4 Address: 10.1.1.1")
        ip_match = re.search(r"(?:IP(?:v4)? address|Entry address\(es\):\s*\n\s*IP address):\s*([0-9\.]+)", block, re.IGNORECASE)
        mgmt_ip = ip_match.group(1).strip() if ip_match else None
        
        # Platform & Capabilities
        plat_match = re.search(r"Platform:\s*([^,\n\r]+)", block, re.IGNORECASE)
        platform = plat_match.group(1).strip() if plat_match else ""
        
        cap_match = re.search(r"Capabilities:\s*([^\n\r]+)", block, re.IGNORECASE)
        cap_str = cap_match.group(1).strip() if cap_match else ""
        capabilities = [c.strip() for c in cap_str.split() if c.strip()]
        
        # Local & Remote Interface
        intf_match = re.search(r"Interface:\s*([^,\n\r]+),\s*Port ID \(outgoing port\):\s*([^\n\r]+)", block, re.IGNORECASE)
        if not intf_match:
            continue
        local_intf = normalize_interface(intf_match.group(1).strip())
        remote_intf = normalize_interface(intf_match.group(2).strip())
        
        # Check if this neighbor is an Access Point or non-switch/router
        is_ap = False
        
        # Check 1: Platform regex
        for pat in excluded_platform_patterns:
            if re.search(pat, platform):
                is_ap = True
                break
                
        # Check 2: Capabilities (APs or Phones lack 'Switch' and 'Router' or report 'Trans-Bridge'/'Wlan AP')
        has_switch_or_router = any(c.lower() in ["switch", "router"] for c in capabilities)
        if not has_switch_or_router and capabilities:
            is_ap = True
        if any(c.lower() in ["wlan", "trans-bridge", "host"] for c in capabilities) and not has_switch_or_router:
            is_ap = True

        # Check 3: Hostname role check if specified
        if excluded_role_patterns:
            for rpat in excluded_role_patterns:
                if re.search(rpat, dest_host):
                    is_ap = True
                    break

        neighbors.append(CDPNeighbor(
            destination_host=dest_host,
            management_ip=mgmt_ip,
            local_interface=local_intf,
            remote_interface=remote_intf,
            platform=platform,
            capabilities=capabilities,
            is_ap=is_ap,
        ))
        
    return neighbors


def parse_arp_table(output: str) -> List[ARPEntry]:
    """Parse 'show ip arp' output."""
    arp_entries: List[ARPEntry] = []
    lines = output.splitlines()
    for line in lines:
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("Protocol") or line_clean.startswith("---"):
            continue
        # Format: Internet  10.10.1.50             14   0050.56a1.b2c3  ARPA   Vlan10
        parts = line_clean.split()
        if len(parts) >= 6 and parts[0].lower() == "internet":
            ip_addr = parts[1]
            age = parts[2] if parts[2] != "-" else "0"
            mac_addr = parts[3]
            intf_name = normalize_interface(parts[5])
            arp_entries.append(ARPEntry(
                ip_address=ip_addr,
                mac_address=mac_addr,
                interface=intf_name,
                age=age,
            ))
    return arp_entries


def parse_lldp_neighbors_detail(
    output: str,
    excluded_platform_patterns: Optional[List[str]] = None,
    excluded_role_patterns: Optional[List[str]] = None,
) -> List[CDPNeighbor]:
    """
    Parse 'show lldp neighbors detail' as fallback if CDP yields 0 neighbors.
    Returns normalized CDPNeighbor objects.
    """
    neighbors: List[CDPNeighbor] = []
    if not output or "%" in output or "LLDP is not enabled" in output:
        return neighbors

    blocks = re.split(r"------------------------------------------------|-------------------------+", output)
    for block in blocks:
        block = block.strip()
        if not block or ("System Name:" not in block and "Chassis id:" not in block):
            continue

        # System Name (Device ID)
        name_match = re.search(r"System Name:\s*([^\n\r]+)", block, re.IGNORECASE)
        chassis_match = re.search(r"Chassis id:\s*([^\n\r]+)", block, re.IGNORECASE)
        dest_host = name_match.group(1).strip() if name_match else (chassis_match.group(1).strip() if chassis_match else "")
        if not dest_host:
            continue

        # Local & Remote Interface
        local_match = re.search(r"(?:Local Interface|Local Port id):\s*([^\n\r,]+)", block, re.IGNORECASE)
        remote_match = re.search(r"Port id:\s*([^\n\r,]+)", block, re.IGNORECASE)
        if not local_match or not remote_match:
            continue
        local_intf = normalize_interface(local_match.group(1).strip())
        remote_intf = normalize_interface(remote_match.group(1).strip())

        # Management IP
        ip_match = re.search(r"(?:Management Address(?:es)?|IP(?:v4)? Address):\s*([0-9\.]+)", block, re.IGNORECASE)
        mgmt_ip = ip_match.group(1).strip() if ip_match else None

        # System Capabilities
        cap_match = re.search(r"System Capabilities:\s*([^\n\r]+)", block, re.IGNORECASE)
        cap_str = cap_match.group(1).strip() if cap_match else ""
        capabilities = [c.strip() for c in cap_str.split(",") if c.strip()]

        # System Description / Platform
        desc_match = re.search(r"System Description:\s*([^\n\r]+)", block, re.IGNORECASE)
        platform = desc_match.group(1).strip() if desc_match else ""

        is_ap = any(k in platform.lower() for k in ["aironet", "access point", "ap-cos"])

        neighbors.append(CDPNeighbor(
            destination_host=dest_host,
            management_ip=mgmt_ip,
            local_interface=local_intf,
            remote_interface=remote_intf,
            platform=platform,
            capabilities=capabilities,
            is_ap=is_ap,
        ))

    return neighbors


def parse_eigrp_neighbors(raw_output: str) -> List[EIGRPNeighbor]:
    """
    Parse 'show ip eigrp neighbors' (and 'show ip eigrp vrf * neighbors') output into EIGRPNeighbor objects.
    Robustly handles AS headers, VRF headers, and tabular neighbor rows.
    """
    if not raw_output or "% EIGRP" in raw_output or "% Invalid" in raw_output:
        return []

    neighbors: List[EIGRPNeighbor] = []
    current_as: Optional[int] = None
    current_vrf: Optional[str] = None

    for line in raw_output.splitlines():
        line_clean = line.strip()
        if not line_clean:
            continue

        # Check VRF header: EIGRP-IPv4 VRF(xyz) Neighbors for AS(100)
        vrf_match = re.search(r"VRF\(([^)]+)\)", line_clean, re.IGNORECASE)
        if vrf_match:
            current_vrf = vrf_match.group(1).strip()

        # Check AS header: EIGRP-IPv4 Neighbors for AS(100) or IP-EIGRP neighbors for process 100
        as_match = re.search(r"(?:AS\(|process\s+)(\d+)", line_clean, re.IGNORECASE)
        if as_match:
            try:
                current_as = int(as_match.group(1))
            except ValueError:
                pass

        # Check if line is a table header or separator
        if any(h in line_clean.lower() for h in ["address", "interface", "hold", "uptime", "srtt", "rto", "neighbors for"]):
            continue

        # Table Row match:
        # H   Address                 Interface              Hold Uptime   SRTT   RTO  Q   Seq
        # 0   10.100.1.2              Gi0/0/1                  12 00:12:34   12   200  0   45
        row_match = re.match(
            r"^\s*(\d+)\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+([A-Za-z0-9\/\.\:]+)\s+(\d+)\s+([0-9\:\-\.a-zA-Z]+)(?:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))?",
            line
        )
        if not row_match:
            continue

        peer_ip = row_match.group(2).strip()
        raw_intf = row_match.group(3).strip()
        hold_time_str = row_match.group(4)
        uptime_str = row_match.group(5)
        srtt_str = row_match.group(6)
        rto_str = row_match.group(7)
        q_cnt_str = row_match.group(8)
        seq_num_str = row_match.group(9)

        # Validate IP
        try:
            ipaddress.IPv4Address(peer_ip)
        except ValueError:
            continue

        local_intf = normalize_interface(raw_intf)

        neighbors.append(EIGRPNeighbor(
            peer_ip=peer_ip,
            local_interface=local_intf,
            as_number=current_as,
            vrf=current_vrf,
            hold_time_sec=int(hold_time_str) if hold_time_str else None,
            uptime=uptime_str,
            srtt_ms=int(srtt_str) if srtt_str else None,
            rto=int(rto_str) if rto_str else None,
            q_cnt=int(q_cnt_str) if q_cnt_str else None,
            seq_num=int(seq_num_str) if seq_num_str else None,
        ))

    return neighbors

