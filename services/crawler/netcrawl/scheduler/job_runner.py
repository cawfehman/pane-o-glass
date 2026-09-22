"""Scheduler and snapshot diff analysis engine."""

from __future__ import annotations
from datetime import datetime
import logging
import time
from typing import Any, Dict, List, Optional

from netcrawl.crawler.engine import NetworkCrawler
from netcrawl.models import Device, DeviceStatus
from netcrawl.storage.database import DatabaseManager
from netcrawl.topology.analyzer import TopologyAnalyzer
from netcrawl.visualizer.map_generator import NetworkMapVisualizer

logger = logging.getLogger(__name__)


def diff_snapshots(db: DatabaseManager, snap1_id: int, snap2_id: int) -> Dict[str, Any]:
    """Compare two crawl snapshots and identify topology changes."""
    devs1 = {d.hostname: d for d in db.get_devices_for_snapshot(snap1_id)}
    devs2 = {d.hostname: d for d in db.get_devices_for_snapshot(snap2_id)}

    hosts1 = set(devs1.keys())
    hosts2 = set(devs2.keys())

    added_devices = [devs2[h].model_dump() for h in (hosts2 - hosts1)]
    removed_devices = [devs1[h].model_dump() for h in (hosts1 - hosts2)]

    status_changes = []
    route_changes = []

    for h in hosts1 & hosts2:
        d1 = devs1[h]
        d2 = devs2[h]
        if d1.status != d2.status:
            status_changes.append({
                "hostname": h,
                "ip": d2.ip_address,
                "old_status": d1.status.value,
                "new_status": d2.status.value,
                "failure_reason": d2.failure_reason,
            })

        # Routes check
        r1_prefixes = {f"{r.prefix}{r.cidr} -> {r.next_hop or r.outgoing_interface}" for r in d1.routes}
        r2_prefixes = {f"{r.prefix}{r.cidr} -> {r.next_hop or r.outgoing_interface}" for r in d2.routes}
        added_r = r2_prefixes - r1_prefixes
        removed_r = r1_prefixes - r2_prefixes
        if added_r or removed_r:
            route_changes.append({
                "hostname": h,
                "added_routes": list(added_r),
                "removed_routes": list(removed_r),
            })

    return {
        "snap1_id": snap1_id,
        "snap2_id": snap2_id,
        "added_devices": added_devices,
        "removed_devices": removed_devices,
        "status_changes": status_changes,
        "route_changes": route_changes,
    }


class CrawlScheduler:
    """Executes scheduled daily or periodic network crawls."""

    def __init__(
        self,
        db: DatabaseManager,
        crawler_factory: Any,
        interval_hours: int = 24,
        target_time: Optional[str] = "02:00",
    ):
        self.db = db
        self.crawler_factory = crawler_factory
        self.interval_hours = interval_hours
        self.target_time = target_time
        self.running = False

    def run_once(self) -> int:
        """Run single crawl cycle, save snapshot, and generate maps."""
        crawler = self.crawler_factory()
        start = time.time()
        reachable, unreachable = crawler.crawl()
        duration = time.time() - start

        snap_id = self.db.save_snapshot(
            reachable_devices=reachable,
            unreachable_devices=unreachable,
            seed_devices=crawler.seed_devices,
            duration_seconds=duration,
        )

        # Generate topology map
        all_devs = reachable + unreachable
        analyzer = TopologyAnalyzer(all_devs)
        vis = NetworkMapVisualizer(analyzer)
        vis.generate_html_map(snapshot_id=snap_id)
        vis.generate_svg_map(snapshot_id=snap_id)

        logger.info(f"Scheduled crawl finished: Snapshot {snap_id} created with {len(all_devs)} devices.")
        return snap_id
