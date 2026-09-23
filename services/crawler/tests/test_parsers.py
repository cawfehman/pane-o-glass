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


def test_nexus_parsers():
    """Verify Cisco Nexus (NX-OS) command output parsing."""
    # 1. NX-OS show version
    nexus_version_output = """
Cisco Nexus Operating System (NX-OS) Software
TAC support: http://www.cisco.com/tac
Copyright (c) 2002-2023, Cisco Systems, Inc. All rights reserved.
Software
  BIOS: version 08.35
  NX-OS: version 9.3(8)
  BIOS compile time:       11/26/2019
Hardware
  cisco Nexus9000 C93180YC-FX Chassis
  Intel(R) Xeon(R) CPU D-1528 @ 1.90GHz with 32904084 kB of memory.
  Processor Board ID FDO24151ABC
Device name: 101-core-swcs-1
bootflash:    62551520 kB
Kernel uptime is 120 day(s), 4 hour(s), 22 minute(s), 10 second(s)
"""
    ver = parse_version(nexus_version_output)
    assert ver["hostname"] == "101-core-swcs-1"
    assert "Nexus9000 C93180YC-FX" in ver["platform"]
    assert "9.3(8)" in ver["os_version"]
    assert ver["serial_number"] == "FDO24151ABC"

    # 2. NX-OS show ip interface brief
    nexus_intf_output = """
IP Interface Status for VRF "default"(1)
Interface            IP Address      Interface Status
mgmt0                172.18.161.50   protocol-up/link-up/admin-up       
Vlan10               10.10.10.1      protocol-up/link-up/admin-up       
Eth1/1               192.168.1.1     protocol-up/link-up/admin-up       
Eth1/2               unassigned      protocol-down/link-down/admin-down 
"""
    intfs = parse_ip_interface_brief(nexus_intf_output)
    assert len(intfs) == 4
    assert intfs["mgmt0"].ip_address == "172.18.161.50"
    assert intfs["mgmt0"].oper_status == "up"
    assert intfs["Vlan10"].is_svi is True
    assert intfs["Ethernet1/1"].ip_address == "192.168.1.1"
    assert intfs["Ethernet1/2"].admin_status == "administratively down"

    # 3. NX-OS show cdp neighbors detail
    nexus_cdp_output = """
----------------------------------------
Device ID: 101-mdf-swds-1(SSI18150ABC)
System Name: 101-mdf-swds-1
Interface address(es):
    IPv4 Address: 10.100.1.2
Platform: cisco WS-C3850-24XS, Capabilities: Router Switch IGMP
Interface: Ethernet1/1, Port ID (outgoing port): GigabitEthernet1/0/1
Cisco IOS Software, IOS-XE Software, Catalyst L3 Switch Software
----------------------------------------
Device ID: 101-core-swcs-2(FDO24151XYZ)
System Name: 101-core-swcs-2
Interface address(es):
    IPv4 Address: 10.100.1.6
Platform: N9K-C93180YC-FX, Capabilities: Router Switch
Interface: Ethernet1/48, Port ID (outgoing port): Ethernet1/48
"""
    cdp = parse_cdp_neighbors_detail(nexus_cdp_output)
    assert len(cdp) == 2
    assert "101-mdf-swds-1" in cdp[0].destination_host
    assert cdp[0].management_ip == "10.100.1.2"
    assert cdp[0].local_interface == "Ethernet1/1"
    assert cdp[0].remote_interface == "GigabitEthernet1/0/1"
    assert "3850" in cdp[0].platform
    assert "101-core-swcs-2" in cdp[1].destination_host
    assert cdp[1].management_ip == "10.100.1.6"
    assert cdp[1].local_interface == "Ethernet1/48"

    # 4. NX-OS show interfaces description
    nexus_desc_output = """
Port          Type     Speed    Description
mgmt0         --       --       OOB-MGMT-NET
Eth1/1        eth      10G      TRUNK_TO_101-MDF-SWDS-1
Eth1/48       eth      40G      VPC_PEER_LINK_TO_SWCS-2
"""
    from netcrawl.parsers.ios_parsers import parse_interfaces_description, parse_switchport_or_trunk
    intfs = parse_interfaces_description(nexus_desc_output, intfs)
    assert intfs["mgmt0"].description == "OOB-MGMT-NET"
    assert intfs["Ethernet1/1"].description == "TRUNK_TO_101-MDF-SWDS-1"
    assert intfs["Ethernet1/48"].description == "VPC_PEER_LINK_TO_SWCS-2"

    # 5. NX-OS show interface switchport
    nexus_switchport_output = """
Name: Ethernet1/1
  Switchport: Enabled
  Switchport Monitor: Not enabled
  Operational Mode: trunk
  Access Mode VLAN: 1 (default)
  Trunking Native Mode VLAN: 1 (default)
  Trunking VLANs Allowed: 1-1000
"""
    intfs = parse_switchport_or_trunk(nexus_switchport_output, intfs)
    assert intfs["Ethernet1/1"].is_trunk is True
    assert intfs["Ethernet1/1"].allowed_vlans == "1-1000"

