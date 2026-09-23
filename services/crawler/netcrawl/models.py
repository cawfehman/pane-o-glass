"""Data models for NetCrawl."""

from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DeviceRole(str, Enum):
    ROUTER = "Router"
    L3_SWITCH = "L3 Switch"
    L2_SWITCH = "L2 Switch"
    UNKNOWN = "Unknown"


class DeviceStatus(str, Enum):
    REACHABLE = "REACHABLE"
    UNREACHABLE = "UNREACHABLE"
    AUTH_FAILED = "AUTH_FAILED"
    TIMEOUT = "TIMEOUT"
    ERROR = "ERROR"
    UNVERIFIED = "UNVERIFIED"


class CrawlProfile(str, Enum):
    DISCOVERY = "DISCOVERY"
    MAPPING = "MAPPING"
    INTENSIVE = "INTENSIVE"


class SiteInfo(BaseModel):
    site: str = Field(description="Site code (first 3 chars, e.g. 101, HSP, CAM)")
    idf: str = Field(description="IDF container (3 chars after first -, e.g. 2mc, mdf, id1)")
    role_code: Optional[str] = Field(default=None, description="Device role string, e.g. swcs, swds, swas")
    iterator: Optional[str] = Field(default=None, description="Device iterator, e.g. 1, 2")
    raw_hostname: str


class Interface(BaseModel):
    name: str
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    cidr: Optional[str] = None
    mac_address: Optional[str] = None
    speed: Optional[str] = None
    duplex: Optional[str] = None
    admin_status: str = "up"
    oper_status: str = "up"
    is_svi: bool = False
    is_trunk: bool = False
    access_vlan: Optional[int] = None
    allowed_vlans: Optional[str] = None
    description: Optional[str] = None


class Route(BaseModel):
    prefix: str
    netmask: str
    cidr: str
    protocol: str = "C" # C, S, O, B, D, R, etc.
    next_hop: Optional[str] = None
    outgoing_interface: Optional[str] = None
    metric: Optional[int] = None
    admin_distance: Optional[int] = None


class VLAN(BaseModel):
    vlan_id: int
    name: str
    status: str = "active"
    ports: List[str] = Field(default_factory=list)


class CDPNeighbor(BaseModel):
    destination_host: str
    management_ip: Optional[str] = None
    local_interface: str
    remote_interface: str
    platform: str = ""
    capabilities: List[str] = Field(default_factory=list)
    is_ap: bool = False


class ARPEntry(BaseModel):
    ip_address: str
    mac_address: str
    interface: str
    age: Optional[str] = None


class Device(BaseModel):
    hostname: str
    ip_address: str
    platform: Optional[str] = None
    os_version: Optional[str] = None
    serial_number: Optional[str] = None
    role: DeviceRole = DeviceRole.UNKNOWN
    status: DeviceStatus = DeviceStatus.REACHABLE
    failure_reason: Optional[str] = None
    discovered_via: Optional[str] = None # e.g. "101-mdf-swds-1 (Gi1/0/24)"
    credential_used: Optional[str] = None
    auth_time_ms: Optional[int] = None
    hop_distance: int = 0
    is_reseed_frontier: bool = False
    boundary_neighbors: List[Dict[str, Any]] = Field(default_factory=list)
    site_info: Optional[SiteInfo] = None
    interfaces: Dict[str, Interface] = Field(default_factory=dict)
    routes: List[Route] = Field(default_factory=list)
    vlans: List[VLAN] = Field(default_factory=list)
    cdp_neighbors: List[CDPNeighbor] = Field(default_factory=list)
    lldp_neighbors: List[CDPNeighbor] = Field(default_factory=list)
    arp_table: List[ARPEntry] = Field(default_factory=list)
    alias_ips: List[str] = Field(default_factory=list)


class TopologyLink(BaseModel):
    source_device: str
    source_interface: str
    source_ip: Optional[str] = None
    target_device: str
    target_interface: str
    target_ip: Optional[str] = None
    link_type: str = "L2_TRUNK" # L2_TRUNK, L2_ACCESS, L3_ROUTED, UNKNOWN
    speed: Optional[str] = None
    duplex: Optional[str] = None
    status: str = "UP" # UP, DOWN, MISMATCH


class SnapshotMetadata(BaseModel):
    snapshot_id: int
    timestamp: str
    seed_devices: List[str]
    total_discovered: int
    total_reachable: int
    total_unreachable: int
    duration_seconds: float
    crawl_profile: str = "INTENSIVE"
    max_hops: Optional[int] = 1
    reseed_points: List[Dict[str, Any]] = Field(default_factory=list)


class PathHop(BaseModel):
    hop_number: int
    device_name: str
    device_ip: str
    role: str
    ingress_interface: Optional[str] = None
    egress_interface: Optional[str] = None
    next_hop_ip: Optional[str] = None
    matched_route: Optional[str] = None
    route_protocol: Optional[str] = None
    forwarding_type: str # "L3_ROUTED", "L2_SWITCHED", "DIRECTLY_CONNECTED", "TERMINAL", "BLACKHOLE"
    notes: str
