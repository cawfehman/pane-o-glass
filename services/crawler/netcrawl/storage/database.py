"""Database storage and JSON snapshot manager for NetCrawl."""

from __future__ import annotations
from datetime import datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

from netcrawl.models import (
    ARPEntry,
    CDPNeighbor,
    Device,
    DeviceRole,
    DeviceStatus,
    Interface,
    Route,
    SiteInfo,
    SnapshotMetadata,
    VLAN,
)

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages SQLite storage for network crawl snapshots."""

    def __init__(self, db_path: str = "data/crawler.db", snapshots_dir: str = "snapshots"):
        self.db_path = Path(db_path)
        self.snapshots_dir = Path(snapshots_dir)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        """Initialize database schema with tables and indexes."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                seed_devices TEXT NOT NULL,
                total_discovered INTEGER NOT NULL,
                total_reachable INTEGER NOT NULL,
                total_unreachable INTEGER NOT NULL,
                duration_seconds REAL NOT NULL,
                crawl_profile TEXT DEFAULT 'INTENSIVE',
                max_hops INTEGER
            );
            """)

            try:
                cursor.execute("ALTER TABLE snapshots ADD COLUMN crawl_profile TEXT DEFAULT 'INTENSIVE'")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE snapshots ADD COLUMN max_hops INTEGER")
            except Exception:
                pass

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                hostname TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                platform TEXT,
                os_version TEXT,
                serial_number TEXT,
                role TEXT NOT NULL,
                status TEXT NOT NULL,
                failure_reason TEXT,
                discovered_via TEXT,
                credential_used TEXT,
                auth_time_ms INTEGER,
                hop_distance INTEGER DEFAULT 0,
                site TEXT,
                idf TEXT,
                role_code TEXT,
                iterator TEXT,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
            );
            """)

            for col, typ in [
                ("credential_used", "TEXT"),
                ("auth_time_ms", "INTEGER"),
                ("hop_distance", "INTEGER DEFAULT 0"),
            ]:
                try:
                    cursor.execute(f"ALTER TABLE devices ADD COLUMN {col} {typ}")
                except Exception:
                    pass

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS interfaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                device_hostname TEXT NOT NULL,
                name TEXT NOT NULL,
                ip_address TEXT,
                cidr TEXT,
                mac_address TEXT,
                speed TEXT,
                duplex TEXT,
                admin_status TEXT,
                oper_status TEXT,
                is_svi INTEGER NOT NULL,
                is_trunk INTEGER NOT NULL,
                access_vlan INTEGER,
                allowed_vlans TEXT,
                description TEXT,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS routes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                device_hostname TEXT NOT NULL,
                prefix TEXT NOT NULL,
                netmask TEXT NOT NULL,
                cidr TEXT NOT NULL,
                protocol TEXT NOT NULL,
                next_hop TEXT,
                outgoing_interface TEXT,
                metric INTEGER,
                admin_distance INTEGER,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS vlans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                device_hostname TEXT NOT NULL,
                vlan_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                ports TEXT,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS cdp_neighbors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                local_hostname TEXT NOT NULL,
                destination_host TEXT NOT NULL,
                management_ip TEXT,
                local_interface TEXT NOT NULL,
                remote_interface TEXT NOT NULL,
                platform TEXT,
                capabilities TEXT,
                is_ap INTEGER NOT NULL,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS arp_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                device_hostname TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                mac_address TEXT NOT NULL,
                interface TEXT NOT NULL,
                age TEXT,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
            );
            """)

            # Indexes for high performance queries
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_snap ON devices(snapshot_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_intf_snap ON interfaces(snapshot_id, device_hostname);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_route_snap ON routes(snapshot_id, device_hostname);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_cdp_snap ON cdp_neighbors(snapshot_id, local_hostname);")
            conn.commit()

    def save_snapshot(
        self,
        reachable_devices: List[Device],
        unreachable_devices: List[Device],
        seed_devices: List[str],
        duration_seconds: float,
        crawl_profile: str = "INTENSIVE",
        max_hops: Optional[int] = 1,
        reseed_points: Optional[List[Dict[str, Any]]] = None,
        unverified_devices: Optional[List[Device]] = None,
    ) -> int:
        """Save a complete crawl snapshot to SQLite and export JSON archive."""
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        unverified_devices = unverified_devices or []
        total_discovered = len(reachable_devices) + len(unreachable_devices) + len(unverified_devices)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO snapshots (
                    timestamp, seed_devices, total_discovered, total_reachable, total_unreachable, duration_seconds, crawl_profile, max_hops
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    json.dumps(seed_devices),
                    total_discovered,
                    len(reachable_devices),
                    len(unreachable_devices),
                    duration_seconds,
                    crawl_profile.upper(),
                    max_hops,
                ),
            )
            snapshot_id = cursor.lastrowid

            # Save all devices (reachable, unreachable, and unverified boundary)
            all_devices = reachable_devices + unreachable_devices + unverified_devices
            for dev in all_devices:
                site = dev.site_info.site if dev.site_info else None
                idf = dev.site_info.idf if dev.site_info else None
                role_code = dev.site_info.role_code if dev.site_info else None
                iterator = dev.site_info.iterator if dev.site_info else None

                cursor.execute(
                    """
                    INSERT INTO devices (
                        snapshot_id, hostname, ip_address, platform, os_version, serial_number,
                        role, status, failure_reason, discovered_via, credential_used, auth_time_ms,
                        hop_distance, site, idf, role_code, iterator
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        snapshot_id,
                        dev.hostname,
                        dev.ip_address,
                        dev.platform,
                        dev.os_version,
                        dev.serial_number,
                        dev.role.value,
                        dev.status.value,
                        dev.failure_reason,
                        dev.discovered_via,
                        dev.credential_used,
                        dev.auth_time_ms,
                        dev.hop_distance,
                        site,
                        idf,
                        role_code,
                        iterator,
                    ),
                )

                # If device was reachable, save interfaces, routes, vlans, cdp, arp
                if dev.status == DeviceStatus.REACHABLE:
                    for intf in dev.interfaces.values():
                        cursor.execute(
                            """
                            INSERT INTO interfaces (
                                snapshot_id, device_hostname, name, ip_address, cidr, mac_address,
                                speed, duplex, admin_status, oper_status, is_svi, is_trunk,
                                access_vlan, allowed_vlans, description
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                snapshot_id,
                                dev.hostname,
                                intf.name,
                                intf.ip_address,
                                intf.cidr,
                                intf.mac_address,
                                intf.speed,
                                intf.duplex,
                                intf.admin_status,
                                intf.oper_status,
                                1 if intf.is_svi else 0,
                                1 if intf.is_trunk else 0,
                                intf.access_vlan,
                                intf.allowed_vlans,
                                intf.description,
                            ),
                        )

                    for r in dev.routes:
                        cursor.execute(
                            """
                            INSERT INTO routes (
                                snapshot_id, device_hostname, prefix, netmask, cidr,
                                protocol, next_hop, outgoing_interface, metric, admin_distance
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                snapshot_id,
                                dev.hostname,
                                r.prefix,
                                r.netmask,
                                r.cidr,
                                r.protocol,
                                r.next_hop,
                                r.outgoing_interface,
                                r.metric,
                                r.admin_distance,
                            ),
                        )

                    for v in dev.vlans:
                        cursor.execute(
                            """
                            INSERT INTO vlans (
                                snapshot_id, device_hostname, vlan_id, name, status, ports
                            ) VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (
                                snapshot_id,
                                dev.hostname,
                                v.vlan_id,
                                v.name,
                                v.status,
                                json.dumps(v.ports),
                            ),
                        )

                    for c in dev.cdp_neighbors:
                        cursor.execute(
                            """
                            INSERT INTO cdp_neighbors (
                                snapshot_id, local_hostname, destination_host, management_ip,
                                local_interface, remote_interface, platform, capabilities, is_ap
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                snapshot_id,
                                dev.hostname,
                                c.destination_host,
                                c.management_ip,
                                c.local_interface,
                                c.remote_interface,
                                c.platform,
                                json.dumps(c.capabilities),
                                1 if c.is_ap else 0,
                            ),
                        )

                    for a in dev.arp_table:
                        cursor.execute(
                            """
                            INSERT INTO arp_entries (
                                snapshot_id, device_hostname, ip_address, mac_address, interface, age
                            ) VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (
                                snapshot_id,
                                dev.hostname,
                                a.ip_address,
                                a.mac_address,
                                a.interface,
                                a.age,
                            ),
                        )

            conn.commit()

        # Also export standalone JSON archive file
        self.export_snapshot_json(snapshot_id, reseed_points=reseed_points)
        return snapshot_id

    def export_snapshot_json(self, snapshot_id: int, reseed_points: Optional[List[Dict[str, Any]]] = None) -> Path:
        """Export snapshot to a clean JSON file."""
        meta = self.get_snapshot_by_id(snapshot_id)
        if not meta:
            raise ValueError(f"Snapshot {snapshot_id} does not exist.")

        if reseed_points:
            meta.reseed_points = reseed_points

        devices = self.get_devices_for_snapshot(snapshot_id)
        safe_ts = meta.timestamp.replace(":", "-").replace(" ", "_")
        target_path = self.snapshots_dir / f"snapshot_{snapshot_id}_{safe_ts}.json"

        data = {
            "metadata": meta.model_dump(),
            "devices": [d.model_dump() for d in devices],
        }

        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        return target_path

    def get_snapshots(self) -> List[SnapshotMetadata]:
        """List all crawl snapshots ordered by most recent first."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM snapshots ORDER BY id DESC")
            rows = cursor.fetchall()
            return [
                SnapshotMetadata(
                    snapshot_id=r["id"],
                    timestamp=r["timestamp"],
                    seed_devices=json.loads(r["seed_devices"]),
                    total_discovered=r["total_discovered"],
                    total_reachable=r["total_reachable"],
                    total_unreachable=r["total_unreachable"],
                    duration_seconds=r["duration_seconds"],
                    crawl_profile=r["crawl_profile"] if "crawl_profile" in r.keys() and r["crawl_profile"] else "INTENSIVE",
                    max_hops=r["max_hops"] if "max_hops" in r.keys() else None,
                )
                for r in rows
            ]

    def get_snapshot_by_id(self, snapshot_id: int) -> Optional[SnapshotMetadata]:
        """Fetch snapshot metadata by ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM snapshots WHERE id = ?", (snapshot_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return SnapshotMetadata(
                snapshot_id=row["id"],
                timestamp=row["timestamp"],
                seed_devices=json.loads(row["seed_devices"]),
                total_discovered=row["total_discovered"],
                total_reachable=row["total_reachable"],
                total_unreachable=row["total_unreachable"],
                duration_seconds=row["duration_seconds"],
                crawl_profile=row["crawl_profile"] if "crawl_profile" in row.keys() and row["crawl_profile"] else "INTENSIVE",
                max_hops=row["max_hops"] if "max_hops" in row.keys() else None,
            )

    def get_latest_snapshot_id(self) -> Optional[int]:
        """Return the highest/latest snapshot ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM snapshots ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            return row["id"] if row else None

    def get_devices_for_snapshot(self, snapshot_id: int) -> List[Device]:
        """Reconstruct complete Device models for a given snapshot."""
        devices: List[Device] = []
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM devices WHERE snapshot_id = ? ORDER BY hostname ASC", (snapshot_id,))
            dev_rows = cursor.fetchall()

            for dr in dev_rows:
                host = dr["hostname"]
                site_info = None
                if dr["site"]:
                    site_info = SiteInfo(
                        site=dr["site"],
                        idf=dr["idf"],
                        role_code=dr["role_code"],
                        iterator=dr["iterator"],
                        raw_hostname=host,
                    )

                # Fetch interfaces
                cursor.execute(
                    "SELECT * FROM interfaces WHERE snapshot_id = ? AND device_hostname = ?",
                    (snapshot_id, host),
                )
                intf_rows = cursor.fetchall()
                interfaces: Dict[str, Interface] = {}
                for ir in intf_rows:
                    interfaces[ir["name"]] = Interface(
                        name=ir["name"],
                        ip_address=ir["ip_address"],
                        cidr=ir["cidr"],
                        mac_address=ir["mac_address"],
                        speed=ir["speed"],
                        duplex=ir["duplex"],
                        admin_status=ir["admin_status"],
                        oper_status=ir["oper_status"],
                        is_svi=bool(ir["is_svi"]),
                        is_trunk=bool(ir["is_trunk"]),
                        access_vlan=ir["access_vlan"],
                        allowed_vlans=ir["allowed_vlans"],
                        description=ir["description"],
                    )

                # Fetch routes
                cursor.execute(
                    "SELECT * FROM routes WHERE snapshot_id = ? AND device_hostname = ?",
                    (snapshot_id, host),
                )
                route_rows = cursor.fetchall()
                routes = [
                    Route(
                        prefix=rr["prefix"],
                        netmask=rr["netmask"],
                        cidr=rr["cidr"],
                        protocol=rr["protocol"],
                        next_hop=rr["next_hop"],
                        outgoing_interface=rr["outgoing_interface"],
                        metric=rr["metric"],
                        admin_distance=rr["admin_distance"],
                    )
                    for rr in route_rows
                ]

                # Fetch VLANs
                cursor.execute(
                    "SELECT * FROM vlans WHERE snapshot_id = ? AND device_hostname = ?",
                    (snapshot_id, host),
                )
                vlan_rows = cursor.fetchall()
                vlans = [
                    VLAN(
                        vlan_id=vr["vlan_id"],
                        name=vr["name"],
                        status=vr["status"],
                        ports=json.loads(vr["ports"]) if vr["ports"] else [],
                    )
                    for vr in vlan_rows
                ]

                # Fetch CDP
                cursor.execute(
                    "SELECT * FROM cdp_neighbors WHERE snapshot_id = ? AND local_hostname = ?",
                    (snapshot_id, host),
                )
                cdp_rows = cursor.fetchall()
                cdp_neighbors = [
                    CDPNeighbor(
                        destination_host=cr["destination_host"],
                        management_ip=cr["management_ip"],
                        local_interface=cr["local_interface"],
                        remote_interface=cr["remote_interface"],
                        platform=cr["platform"],
                        capabilities=json.loads(cr["capabilities"]) if cr["capabilities"] else [],
                        is_ap=bool(cr["is_ap"]),
                    )
                    for cr in cdp_rows
                ]

                # Fetch ARP
                cursor.execute(
                    "SELECT * FROM arp_entries WHERE snapshot_id = ? AND device_hostname = ?",
                    (snapshot_id, host),
                )
                arp_rows = cursor.fetchall()
                arp_table = [
                    ARPEntry(
                        ip_address=ar["ip_address"],
                        mac_address=ar["mac_address"],
                        interface=ar["interface"],
                        age=ar["age"],
                    )
                    for ar in arp_rows
                ]

                dev = Device(
                    hostname=host,
                    ip_address=dr["ip_address"],
                    platform=dr["platform"],
                    os_version=dr["os_version"],
                    serial_number=dr["serial_number"],
                    role=DeviceRole(dr["role"]),
                    status=DeviceStatus(dr["status"]),
                    failure_reason=dr["failure_reason"],
                    discovered_via=dr["discovered_via"],
                    credential_used=dr["credential_used"] if "credential_used" in dr.keys() else None,
                    auth_time_ms=dr["auth_time_ms"] if "auth_time_ms" in dr.keys() else None,
                    hop_distance=dr["hop_distance"] if "hop_distance" in dr.keys() and dr["hop_distance"] is not None else 0,
                    site_info=site_info,
                    interfaces=interfaces,
                    routes=routes,
                    vlans=vlans,
                    cdp_neighbors=cdp_neighbors,
                    arp_table=arp_table,
                )
                devices.append(dev)

        return devices

    def get_unreachable_devices(self, snapshot_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Fetch all unreachable/failed devices flagged for investigation."""
        target_snap = snapshot_id if snapshot_id is not None else self.get_latest_snapshot_id()
        if target_snap is None:
            return []

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT hostname, ip_address, role, status, failure_reason, discovered_via, site, idf
                FROM devices
                WHERE snapshot_id = ? AND status != 'REACHABLE'
                ORDER BY hostname ASC
                """,
                (target_snap,),
            )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
