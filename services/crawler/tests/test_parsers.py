"""Unit tests for Cisco IOS parsers and read-only safety validation."""

import pytest
from netcrawl.crawler.ssh_client import ConfigModeForbiddenError, validate_readonly_command
from netcrawl.parsers.ios_parsers import (
    normalize_interface,
    parse_cdp_neighbors_detail,
    parse_ip_interface_brief,
    parse_routes,
    parse_site_info,
    parse_version,
)


def test_site_info_naming_convention():
    """Verify naming convention aaa-bbb-cccc-d parsing."""
    site_info = parse_site_info("101-mdf-swcs-1")
    assert site_info is not None
    assert site_info.site == "101"
    assert site_info.idf == "mdf"
    assert site_info.role_code == "swcs"
    assert site_info.iterator == "1"

    # With domain suffix
    site_info_fqdn = parse_site_info("204-id2-swas-2.corp.local")
    assert site_info_fqdn is not None
    assert site_info_fqdn.site == "204"
    assert site_info_fqdn.idf == "id2"
    assert site_info_fqdn.role_code == "swas"
    assert site_info_fqdn.iterator == "2"


def test_readonly_safety_guard():
    """Strictly verify that config mode and state modifying commands are BLOCKED."""
    # Permitted read-only commands
    validate_readonly_command("show ip route")
    validate_readonly_command("show version")
    validate_readonly_command("show interfaces trunk")
    validate_readonly_command("terminal length 0")
    validate_readonly_command("terminal width 512")

    # Forbidden commands must raise ConfigModeForbiddenError
    unsafe_commands = [
        "configure terminal",
        "conf t",
        "config term",
        "write memory",
        "wr",
        "erase startup-config",
        "reload",
        "shutdown",
        "no shutdown",
        "ip route 0.0.0.0 0.0.0.0 1.1.1.1",
        "interface GigabitEthernet0/1",
        "vlan 10",
        "delete flash:test",
        "copy running-config startup-config",
    ]
    for cmd in unsafe_commands:
        with pytest.raises(ConfigModeForbiddenError):
            validate_readonly_command(cmd)


def test_cdp_ap_filtering():
    """Verify that Wireless APs are flagged and filtered from crawl queue."""
    sample_cdp = """
--------------------------------------------------
Device ID: 101-mdf-swds-1.corp.local
Entry address(es): 
  IP address: 10.100.1.2
Platform: cisco WS-C3850-24XS,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/0/0,  Port ID (outgoing port): GigabitEthernet1/0/1
--------------------------------------------------
Device ID: 101-id1-wlap-1.corp.local
Entry address(es): 
  IP address: 10.10.10.75
Platform: cisco AIR-AP3802I-B-K9,  Capabilities: Trans-Bridge
Interface: GigabitEthernet0/24,  Port ID (outgoing port): GigabitEthernet0
"""
    neighbors = parse_cdp_neighbors_detail(sample_cdp)
    assert len(neighbors) == 2
    # Switch
    assert neighbors[0].destination_host == "101-mdf-swds-1.corp.local"
    assert neighbors[0].is_ap is False
    # Wireless AP
    assert neighbors[1].destination_host == "101-id1-wlap-1.corp.local"
    assert neighbors[1].is_ap is True


def test_route_parsing():
    """Verify routing table parsing."""
    sample_routes = """
Gateway of last resort is 198.51.100.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 198.51.100.1, GigabitEthernet0/0/2
C     10.100.1.0/30 is directly connected, GigabitEthernet0/0/0
O     10.10.10.0/24 [110/2] via 10.100.1.2, GigabitEthernet0/0/0
"""
    routes = parse_routes(sample_routes)
    assert len(routes) == 3

    # Default static
    assert routes[0].prefix == "0.0.0.0"
    assert routes[0].cidr == "/0"
    assert routes[0].next_hop == "198.51.100.1"

    # Connected
    assert routes[1].prefix == "10.100.1.0"
    assert routes[1].cidr == "/30"
    assert routes[1].next_hop == "DIRECTLY_CONNECTED"

    # OSPF
    assert routes[2].prefix == "10.10.10.0"
    assert routes[2].cidr == "/24"
    assert routes[2].next_hop == "10.100.1.2"
    assert routes[2].metric == 2
    assert routes[2].admin_distance == 110


def test_ip_interface_brief():
    """Verify IP interface brief parsing."""
    sample_intf = """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0/0   10.100.1.1      YES manual up                    up      
GigabitEthernet0/0/1   unassigned      YES unset  administratively down down    
Vlan10                 10.10.10.1      YES manual up                    up      
"""
    intfs = parse_ip_interface_brief(sample_intf)
    assert len(intfs) == 3
    assert intfs["GigabitEthernet0/0/0"].ip_address == "10.100.1.1"
    assert intfs["GigabitEthernet0/0/0"].oper_status == "up"
    assert intfs["GigabitEthernet0/0/1"].admin_status == "administratively down"
    assert intfs["Vlan10"].is_svi is True
