"""Mock Cisco IOS network for testing, validation, and offline demos."""

from __future__ import annotations
from typing import Any, Dict, Optional, Tuple
from netcrawl.crawler.ssh_client import validate_readonly_command


class MockCiscoDevice:
    def __init__(self, hostname: str, ip: str, platform: str, outputs: Dict[str, str], fail_reason: Optional[str] = None):
        self.hostname = hostname
        self.ip = ip
        self.platform = platform
        self.outputs = outputs
        self.fail_reason = fail_reason

    def run_command(self, command: str) -> str:
        validate_readonly_command(command)
        cmd_clean = command.strip().lower()
        for k, v in self.outputs.items():
            if k in cmd_clean:
                return v
        return f"% Command '{command}' not recognized in mock environment."


MOCK_TOPOLOGY_DATA: Dict[str, MockCiscoDevice] = {
    # -------------------------------------------------------------
    # SITE 101: Core Router
    # -------------------------------------------------------------
    "10.100.1.1": MockCiscoDevice(
        hostname="101-mdf-cr01-1",
        ip="10.100.1.1",
        platform="cisco ISR4451-X/K9",
        outputs={
            "show version": """
Cisco IOS XE Software, Version 17.06.03
cisco ISR4451-X/K9 (1RU) processor with 3574943K/6147K bytes of memory.
Processor board ID FDO2145A0BC
101-mdf-cr01-1 uptime is 42 weeks, 3 days, 14 hours, 22 minutes
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0/0   10.100.1.1      YES manual up                    up      
GigabitEthernet0/0/1   10.254.1.1      YES manual up                    up      
GigabitEthernet0/0/2   198.51.100.2    YES manual up                    up      
Loopback0              10.100.0.1      YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet0/0/0 is up, line protocol is up
  Hardware is ISR4451-X, address is 00a1.2b3c.0101 (bia 00a1.2b3c.0101)
  Description: LINK_TO_101-MDF-SWDS-1_Gi1/0/1
  Internet address is 10.100.1.1/30
  Full-duplex, 1000Mb/s, media type is RJ45
GigabitEthernet0/0/1 is up, line protocol is up
  Hardware is ISR4451-X, address is 00a1.2b3c.0102 (bia 00a1.2b3c.0102)
  Description: WAN_TO_202-MDF-CR01-1_Gi0/0/1
  Internet address is 10.254.1.1/30
  Full-duplex, 1000Mb/s, media type is RJ45
""",
            "show ip route": """
Gateway of last resort is 198.51.100.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 198.51.100.1, GigabitEthernet0/0/2
C     10.100.1.0/30 is directly connected, GigabitEthernet0/0/0
C     10.254.1.0/30 is directly connected, GigabitEthernet0/0/1
O     10.10.10.0/24 [110/2] via 10.100.1.2, GigabitEthernet0/0/0
O     10.10.20.0/24 [110/2] via 10.100.1.2, GigabitEthernet0/0/0
O     10.10.30.0/24 [110/2] via 10.100.1.2, GigabitEthernet0/0/0
O     10.20.50.0/24 [110/10] via 10.254.1.2, GigabitEthernet0/0/1
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 101-mdf-swds-1.corp.local
Entry address(es): 
  IP address: 10.100.1.2
Platform: cisco WS-C3850-24XS,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/0/0,  Port ID (outgoing port): GigabitEthernet1/0/1
--------------------------------------------------
Device ID: 202-mdf-cr01-1.corp.local
Entry address(es): 
  IP address: 10.254.1.2
Platform: cisco ISR4451-X/K9,  Capabilities: Router
Interface: GigabitEthernet0/0/1,  Port ID (outgoing port): GigabitEthernet0/0/1
""",
            "show vlan": "",
            "show interfaces switchport": "",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.100.1.2             12   00a1.2b3c.0102  ARPA   GigabitEthernet0/0/0
Internet  10.254.1.2              5   00a1.2b3c.0201  ARPA   GigabitEthernet0/0/1
""",
        },
    ),

    # -------------------------------------------------------------
    # SITE 101: Distribution L3 Switch
    # -------------------------------------------------------------
    "10.100.1.2": MockCiscoDevice(
        hostname="101-mdf-swds-1",
        ip="10.100.1.2",
        platform="cisco WS-C3850-24XS",
        outputs={
            "show version": """
Cisco IOS Software, IOS-XE Software, Catalyst L3 Switch Software (CAT3K_CAA-UNIVERSALK9-M), Version 16.12.04
cisco WS-C3850-24XS (MIPS) processor with 2097152K bytes of physical memory.
Processor board ID FOC2233X0AB
101-mdf-swds-1 uptime is 30 weeks, 1 day, 8 hours, 10 minutes
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet1/0/1   10.100.1.2      YES manual up                    up      
GigabitEthernet1/0/2   unassigned      YES unset  up                    up      
GigabitEthernet1/0/3   unassigned      YES unset  up                    up      
GigabitEthernet1/0/4   unassigned      YES unset  up                    up      
Vlan10                 10.10.10.1      YES manual up                    up      
Vlan20                 10.10.20.1      YES manual up                    up      
Vlan30                 10.10.30.1      YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet1/0/1 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.0102 (bia 00a1.2b3c.0102)
  Description: UPLINK_TO_101-MDF-CR01-1_Gi0/0/0
  Internet address is 10.100.1.2/30
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet1/0/2 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.0103 (bia 00a1.2b3c.0103)
  Description: TRUNK_TO_101-ID1-SWAS-1
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet1/0/3 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.0104 (bia 00a1.2b3c.0104)
  Description: TRUNK_TO_101-ID2-SWAS-1
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet1/0/4 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.0105 (bia 00a1.2b3c.0105)
  Description: TRUNK_TO_101-ID3-SWAS-1_INVESTIGATE
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
Vlan10 is up, line protocol is up
  Internet address is 10.10.10.1/24
Vlan20 is up, line protocol is up
  Internet address is 10.10.20.1/24
Vlan30 is up, line protocol is up
  Internet address is 10.10.30.1/24
""",
            "show ip route": """
Gateway of last resort is 10.100.1.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 10.100.1.1, GigabitEthernet1/0/1
C     10.100.1.0/30 is directly connected, GigabitEthernet1/0/1
C     10.10.10.0/24 is directly connected, Vlan10
C     10.10.20.0/24 is directly connected, Vlan20
C     10.10.30.0/24 is directly connected, Vlan30
O     10.20.50.0/24 [110/11] via 10.100.1.1, GigabitEthernet1/0/1
""",
            "show interfaces trunk": """
Port        Mode             Encapsulation  Status        Native vlan
Gi1/0/2     on               802.1q         trunking      1
Gi1/0/3     on               802.1q         trunking      1
Gi1/0/4     on               802.1q         trunking      1

Port        Vlans allowed on trunk
Gi1/0/2     10,20,30
Gi1/0/3     10,20,30
Gi1/0/4     10,20,30
""",
            "show vlan brief": """
1    default                          active    
10   USERS_DATA                       active    
20   VOIP_VOICE                       active    
30   SERVERS                          active    
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 101-mdf-cr01-1.corp.local
Entry address(es): 
  IP address: 10.100.1.1
Platform: cisco ISR4451-X/K9,  Capabilities: Router
Interface: GigabitEthernet1/0/1,  Port ID (outgoing port): GigabitEthernet0/0/0
--------------------------------------------------
Device ID: 101-id1-swas-1.corp.local
Entry address(es): 
  IP address: 10.10.10.11
Platform: cisco WS-C2960X-48FPS-L,  Capabilities: Switch IGMP
Interface: GigabitEthernet1/0/2,  Port ID (outgoing port): GigabitEthernet0/1
--------------------------------------------------
Device ID: 101-id2-swas-1.corp.local
Entry address(es): 
  IP address: 10.10.10.12
Platform: cisco WS-C2960X-48FPS-L,  Capabilities: Switch IGMP
Interface: GigabitEthernet1/0/3,  Port ID (outgoing port): GigabitEthernet0/1
--------------------------------------------------
Device ID: 101-id3-swas-1.corp.local
Entry address(es): 
  IP address: 10.10.10.99
Platform: cisco WS-C2960X-24TD-L,  Capabilities: Switch IGMP
Interface: GigabitEthernet1/0/4,  Port ID (outgoing port): GigabitEthernet0/1
""",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.100.1.1             10   00a1.2b3c.0101  ARPA   GigabitEthernet1/0/1
Internet  10.10.10.11             5   00a1.2b3c.1011  ARPA   Vlan10
Internet  10.10.10.12             5   00a1.2b3c.1012  ARPA   Vlan10
Internet  10.10.10.50             2   0050.56a1.b2c3  ARPA   Vlan10
Internet  10.10.30.100            1   0050.56fe.9988  ARPA   Vlan30
""",
        },
    ),

    # -------------------------------------------------------------
    # SITE 101: IDF 1 Access L2 Switch
    # -------------------------------------------------------------
    "10.10.10.11": MockCiscoDevice(
        hostname="101-id1-swas-1",
        ip="10.10.10.11",
        platform="cisco WS-C2960X-48FPS-L",
        outputs={
            "show version": """
Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E4
cisco WS-C2960X-48FPS-L (APM86392) processor with 524288K bytes of memory.
Processor board ID FOC2111Y8ZZ
101-id1-swas-1 uptime is 15 weeks, 2 days, 4 hours, 3 minutes
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1     unassigned      YES unset  up                    up      
GigabitEthernet0/5     unassigned      YES unset  up                    up      
GigabitEthernet0/24    unassigned      YES unset  up                    up      
Vlan10                 10.10.10.11     YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet0/1 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.1011 (bia 00a1.2b3c.1011)
  Description: UPLINK_TO_101-MDF-SWDS-1_Gi1/0/2
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet0/5 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.1015 (bia 00a1.2b3c.1015)
  Description: WORKSTATION_PC_50
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet0/24 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.1024 (bia 00a1.2b3c.1024)
  Description: ACCESS_POINT_101-ID1-WLAP-1
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
Vlan10 is up, line protocol is up
  Internet address is 10.10.10.11/24
""",
            "show interfaces trunk": """
Port        Mode             Encapsulation  Status        Native vlan
Gi0/1       on               802.1q         trunking      1

Port        Vlans allowed on trunk
Gi0/1       10,20,30
""",
            "show vlan brief": """
1    default                          active    
10   USERS_DATA                       active    Gi0/5, Gi0/24
20   VOIP_VOICE                       active    
""",
            "show ip route": """
Default gateway is 10.10.10.1
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 101-mdf-swds-1.corp.local
Entry address(es): 
  IP address: 10.100.1.2
Platform: cisco WS-C3850-24XS,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet1/0/2
--------------------------------------------------
Device ID: 101-id1-wlap-1.corp.local
Entry address(es): 
  IP address: 10.10.10.75
Platform: cisco AIR-AP3802I-B-K9,  Capabilities: Trans-Bridge
Interface: GigabitEthernet0/24,  Port ID (outgoing port): GigabitEthernet0
""",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.10.10.1             10   00a1.2b3c.0102  ARPA   Vlan10
Internet  10.10.10.50             1   0050.56a1.b2c3  ARPA   Vlan10
""",
        },
    ),

    # -------------------------------------------------------------
    # SITE 101: IDF 2 Access L2 Switch
    # -------------------------------------------------------------
    "10.10.10.12": MockCiscoDevice(
        hostname="101-id2-swas-1",
        ip="10.10.10.12",
        platform="cisco WS-C2960X-48FPS-L",
        outputs={
            "show version": """
Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E4
cisco WS-C2960X-48FPS-L (APM86392) processor with 524288K bytes of memory.
Processor board ID FOC2111Y9AA
101-id2-swas-1 uptime is 15 weeks, 2 days, 4 hours, 1 minute
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1     unassigned      YES unset  up                    up      
GigabitEthernet0/10    unassigned      YES unset  up                    up      
Vlan10                 10.10.10.12     YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet0/1 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.1012 (bia 00a1.2b3c.1012)
  Description: UPLINK_TO_101-MDF-SWDS-1_Gi1/0/3
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet0/10 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.1030 (bia 00a1.2b3c.1030)
  Description: LOCAL_SERVER_APP_01
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
Vlan10 is up, line protocol is up
  Internet address is 10.10.10.12/24
""",
            "show interfaces trunk": """
Port        Mode             Encapsulation  Status        Native vlan
Gi0/1       on               802.1q         trunking      1

Port        Vlans allowed on trunk
Gi0/1       10,20,30
""",
            "show vlan brief": """
1    default                          active    
10   USERS_DATA                       active    
30   SERVERS                          active    Gi0/10
""",
            "show ip route": """
Default gateway is 10.10.10.1
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 101-mdf-swds-1.corp.local
Entry address(es): 
  IP address: 10.100.1.2
Platform: cisco WS-C3850-24XS,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet1/0/3
""",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.10.10.1             10   00a1.2b3c.0102  ARPA   Vlan10
Internet  10.10.30.100            2   0050.56fe.9988  ARPA   Vlan10
""",
        },
    ),

    # -------------------------------------------------------------
    # SITE 101: IDF 3 Unreachable / Failed Switch
    # -------------------------------------------------------------
    "10.10.10.99": MockCiscoDevice(
        hostname="101-id3-swas-1",
        ip="10.10.10.99",
        platform="cisco WS-C2960X-24TD-L",
        outputs={},
        fail_reason="SSH connection timed out after 10 seconds (Host down or firewall blocking port 22)",
    ),

    # -------------------------------------------------------------
    # SITE 202: Core Router
    # -------------------------------------------------------------
    "10.254.1.2": MockCiscoDevice(
        hostname="202-mdf-cr01-1",
        ip="10.254.1.2",
        platform="cisco ISR4451-X/K9",
        outputs={
            "show version": """
Cisco IOS XE Software, Version 17.06.03
cisco ISR4451-X/K9 processor with 3574943K/6147K bytes of memory.
Processor board ID FDO2145B1AA
202-mdf-cr01-1 uptime is 20 weeks, 5 days, 2 hours, 10 minutes
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0/1   10.254.1.2      YES manual up                    up      
GigabitEthernet0/0/2   10.200.1.1      YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet0/0/1 is up, line protocol is up
  Hardware is ISR4451-X, address is 00a1.2b3c.0201 (bia 00a1.2b3c.0201)
  Description: WAN_TO_101-MDF-CR01-1_Gi0/0/1
  Internet address is 10.254.1.2/30
  Full-duplex, 1000Mb/s, media type is RJ45
GigabitEthernet0/0/2 is up, line protocol is up
  Hardware is ISR4451-X, address is 00a1.2b3c.0202 (bia 00a1.2b3c.0202)
  Description: LINK_TO_202-MDF-SWDS-1_Gi1/0/1
  Internet address is 10.200.1.1/30
  Full-duplex, 1000Mb/s, media type is RJ45
""",
            "show ip route": """
Gateway of last resort is 10.254.1.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 10.254.1.1, GigabitEthernet0/0/1
C     10.254.1.0/30 is directly connected, GigabitEthernet0/0/1
C     10.200.1.0/30 is directly connected, GigabitEthernet0/0/2
O     10.20.50.0/24 [110/2] via 10.200.1.2, GigabitEthernet0/0/2
O     10.10.10.0/24 [110/11] via 10.254.1.1, GigabitEthernet0/0/1
O     10.10.30.0/24 [110/11] via 10.254.1.1, GigabitEthernet0/0/1
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 101-mdf-cr01-1.corp.local
Entry address(es): 
  IP address: 10.254.1.1
Platform: cisco ISR4451-X/K9,  Capabilities: Router
Interface: GigabitEthernet0/0/1,  Port ID (outgoing port): GigabitEthernet0/0/1
--------------------------------------------------
Device ID: 202-mdf-swds-1.corp.local
Entry address(es): 
  IP address: 10.200.1.2
Platform: cisco WS-C3850-24XS,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/0/2,  Port ID (outgoing port): GigabitEthernet1/0/1
""",
            "show vlan": "",
            "show interfaces switchport": "",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.254.1.1              5   00a1.2b3c.0102  ARPA   GigabitEthernet0/0/1
Internet  10.200.1.2              5   00a1.2b3c.0203  ARPA   GigabitEthernet0/0/2
""",
        },
    ),

    # -------------------------------------------------------------
    # SITE 202: Distribution L3 Switch
    # -------------------------------------------------------------
    "10.200.1.2": MockCiscoDevice(
        hostname="202-mdf-swds-1",
        ip="10.200.1.2",
        platform="cisco WS-C3850-24XS",
        outputs={
            "show version": """
Cisco IOS Software, IOS-XE Software, Catalyst L3 Switch Software (CAT3K_CAA-UNIVERSALK9-M), Version 16.12.04
cisco WS-C3850-24XS processor with 2097152K bytes of memory.
Processor board ID FOC2233X1CD
202-mdf-swds-1 uptime is 20 weeks, 5 days, 1 hour, 45 minutes
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet1/0/1   10.200.1.2      YES manual up                    up      
GigabitEthernet1/0/2   unassigned      YES unset  up                    up      
Vlan50                 10.20.50.1      YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet1/0/1 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.0203 (bia 00a1.2b3c.0203)
  Description: UPLINK_TO_202-MDF-CR01-1_Gi0/0/2
  Internet address is 10.200.1.2/30
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet1/0/2 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.0204 (bia 00a1.2b3c.0204)
  Description: TRUNK_TO_202-ID1-SWAS-1
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
Vlan50 is up, line protocol is up
  Internet address is 10.20.50.1/24
""",
            "show ip route": """
Gateway of last resort is 10.200.1.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 10.200.1.1, GigabitEthernet1/0/1
C     10.200.1.0/30 is directly connected, GigabitEthernet1/0/1
C     10.20.50.0/24 is directly connected, Vlan50
O     10.10.10.0/24 [110/12] via 10.200.1.1, GigabitEthernet1/0/1
O     10.10.30.0/24 [110/12] via 10.200.1.1, GigabitEthernet1/0/1
""",
            "show interfaces trunk": """
Port        Mode             Encapsulation  Status        Native vlan
Gi1/0/2     on               802.1q         trunking      1

Port        Vlans allowed on trunk
Gi1/0/2     50
""",
            "show vlan brief": """
1    default                          active    
50   REMOTE_DATA                      active    
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 202-mdf-cr01-1.corp.local
Entry address(es): 
  IP address: 10.200.1.1
Platform: cisco ISR4451-X/K9,  Capabilities: Router
Interface: GigabitEthernet1/0/1,  Port ID (outgoing port): GigabitEthernet0/0/2
--------------------------------------------------
Device ID: 202-id1-swas-1.corp.local
Entry address(es): 
  IP address: 10.20.50.10
Platform: cisco WS-C2960X-24TD-L,  Capabilities: Switch IGMP
Interface: GigabitEthernet1/0/2,  Port ID (outgoing port): GigabitEthernet0/1
""",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.200.1.1              5   00a1.2b3c.0202  ARPA   GigabitEthernet1/0/1
Internet  10.20.50.10             5   00a1.2b3c.2010  ARPA   Vlan50
Internet  10.20.50.88             1   0050.56aa.7744  ARPA   Vlan50
""",
        },
    ),

    # -------------------------------------------------------------
    # SITE 202: IDF 1 Access L2 Switch
    # -------------------------------------------------------------
    "10.20.50.10": MockCiscoDevice(
        hostname="202-id1-swas-1",
        ip="10.20.50.10",
        platform="cisco WS-C2960X-24TD-L",
        outputs={
            "show version": """
Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E4
cisco WS-C2960X-24TD-L processor with 524288K bytes of memory.
Processor board ID FOC2111Y8AB
202-id1-swas-1 uptime is 20 weeks, 4 days, 22 hours, 10 minutes
""",
            "show ip interface brief": """
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1     unassigned      YES unset  up                    up      
GigabitEthernet0/8     unassigned      YES unset  up                    up      
Vlan50                 10.20.50.10     YES manual up                    up      
""",
            "show interfaces": """
GigabitEthernet0/1 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.2010 (bia 00a1.2b3c.2010)
  Description: UPLINK_TO_202-MDF-SWDS-1_Gi1/0/2
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
GigabitEthernet0/8 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00a1.2b3c.2088 (bia 00a1.2b3c.2088)
  Description: REMOTE_SERVER_APP_88
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
Vlan50 is up, line protocol is up
  Internet address is 10.20.50.10/24
""",
            "show interfaces trunk": """
Port        Mode             Encapsulation  Status        Native vlan
Gi0/1       on               802.1q         trunking      1

Port        Vlans allowed on trunk
Gi0/1       50
""",
            "show vlan brief": """
1    default                          active    
50   REMOTE_DATA                      active    Gi0/8
""",
            "show ip route": """
Default gateway is 10.20.50.1
""",
            "show cdp neighbors detail": """
--------------------------------------------------
Device ID: 202-mdf-swds-1.corp.local
Entry address(es): 
  IP address: 10.200.1.2
Platform: cisco WS-C3850-24XS,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet1/0/2
""",
            "show ip arp": """
Protocol  Address          Age (min)  Hardware Addr   Type   Interface
Internet  10.20.50.1              5   00a1.2b3c.0204  ARPA   Vlan50
Internet  10.20.50.88             1   0050.56aa.7744  ARPA   Vlan50
""",
        },
    ),
}


class MockSSHClient:
    """Mock SSH client that intercepts commands, validates safety, and audits all events."""

    def __init__(self, host: str, **kwargs):
        self.host = host
        self.device = MOCK_TOPOLOGY_DATA.get(host)

    def connect(self) -> Tuple[bool, Optional[str]]:
        from netcrawl.audit.logger import get_audit_logger
        audit = get_audit_logger()
        audit.log(
            event_type="SSH_CONNECT_ATTEMPT",
            severity="INFO",
            device_ip=self.host,
            details={"mode": "virtual_mock", "host": self.host},
        )
        if not self.device:
            audit.log(
                event_type="SSH_CONNECT_CONNECTION_ERROR",
                severity="WARNING",
                device_ip=self.host,
                details={"error": f"Unknown host '{self.host}' not in mock network"},
            )
            return False, f"CONNECTION_ERROR: Unknown host '{self.host}' not reachable in mock network."
        if self.device.fail_reason:
            audit.log(
                event_type="SSH_CONNECT_TIMEOUT",
                severity="WARNING",
                device_ip=self.host,
                details={"error": self.device.fail_reason},
            )
            return False, self.device.fail_reason

        audit.log(
            event_type="SSH_CONNECT_SUCCESS",
            severity="INFO",
            device_ip=self.host,
            hostname=self.device.hostname,
            details={"mode": "virtual_mock"},
        )
        return True, None

    def send_command(self, command: str) -> str:
        if not self.device:
            raise RuntimeError(f"Host {self.host} not connected.")
        output = self.device.run_command(command)
        from netcrawl.audit.logger import get_audit_logger
        get_audit_logger().log(
            event_type="COMMAND_EXEC",
            severity="INFO",
            device_ip=self.host,
            hostname=self.device.hostname,
            details={
                "command": command,
                "response_bytes": len(output),
                "response_lines": len(output.splitlines()),
            },
        )
        return output

    def disconnect(self) -> None:
        from netcrawl.audit.logger import get_audit_logger
        get_audit_logger().log(
            event_type="SSH_DISCONNECT",
            severity="INFO",
            device_ip=self.host,
            details={"status": "closed", "mode": "virtual_mock"},
        )
