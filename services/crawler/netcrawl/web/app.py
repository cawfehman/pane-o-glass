"""FastAPI web application for NetCrawl."""

from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from netcrawl.crawler.engine import NetworkCrawler
from netcrawl.models import DeviceStatus
from netcrawl.scheduler.job_runner import diff_snapshots
from netcrawl.storage.database import DatabaseManager
from netcrawl.topology.analyzer import TopologyAnalyzer
from netcrawl.tracer.path_tracer import PathTracer
from netcrawl.visualizer.map_generator import NetworkMapVisualizer

logger = logging.getLogger(__name__)


class PathTraceRequest(BaseModel):
    source_ip: str
    dest_ip: str
    snapshot_id: Optional[int] = None


class CrawlRequest(BaseModel):
    use_mock: bool = True
    seeds: Optional[List[str]] = None


def create_app(db_path: str = "data/crawler.db", snapshots_dir: str = "snapshots", maps_dir: str = "maps") -> FastAPI:
    app = FastAPI(title="NetCrawl - Cisco Network Topology & Analysis")
    db = DatabaseManager(db_path=db_path, snapshots_dir=snapshots_dir)

    @app.get("/api/snapshots")
    def list_snapshots():
        return [s.model_dump() for s in db.get_snapshots()]

    @app.get("/api/snapshot/{snapshot_id}")
    def get_snapshot(snapshot_id: int):
        meta = db.get_snapshot_by_id(snapshot_id)
        if not meta:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        devices = db.get_devices_for_snapshot(snapshot_id)
        analyzer = TopologyAnalyzer(devices)
        return {
            "metadata": meta.model_dump(),
            "summary": analyzer.get_summary(),
            "devices": [d.model_dump() for d in devices],
            "links": [l.model_dump() for l in analyzer.links],
        }

    @app.get("/api/snapshot/{snapshot_id}/svg")
    def get_snapshot_svg(snapshot_id: int):
        svg_file = Path(maps_dir) / f"network_map_snapshot_{snapshot_id}.svg"
        if not svg_file.exists():
            devices = db.get_devices_for_snapshot(snapshot_id)
            if not devices:
                raise HTTPException(status_code=404, detail="Snapshot not found")
            analyzer = TopologyAnalyzer(devices)
            vis = NetworkMapVisualizer(analyzer, maps_dir=maps_dir)
            svg_file = vis.generate_svg_map(snapshot_id=snapshot_id)
        with open(svg_file, "r", encoding="utf-8") as f:
            from fastapi.responses import Response
            return Response(content=f.read(), media_type="image/svg+xml")

    @app.get("/api/unreachable")
    def get_unreachable(snapshot_id: Optional[int] = None):
        return db.get_unreachable_devices(snapshot_id)

    @app.post("/api/trace")
    def run_path_trace(req: PathTraceRequest):
        snap_id = req.snapshot_id if req.snapshot_id is not None else db.get_latest_snapshot_id()
        if snap_id is None:
            raise HTTPException(status_code=400, detail="No snapshots available. Please run a crawl first.")

        devices = db.get_devices_for_snapshot(snap_id)
        if not devices:
            raise HTTPException(status_code=404, detail="No devices in snapshot.")

        tracer = PathTracer(devices)
        hops, delivered, message = tracer.trace(req.source_ip, req.dest_ip)

        return {
            "snapshot_id": snap_id,
            "source_ip": req.source_ip,
            "dest_ip": req.dest_ip,
            "delivered": delivered,
            "message": message,
            "hops": [h.model_dump() for h in hops],
        }

    @app.post("/api/crawl")
    def trigger_crawl(req: CrawlRequest):
        seeds = req.seeds or ["10.100.1.1"]
        crawler = NetworkCrawler(
            seed_devices=seeds,
            use_mock=req.use_mock,
        )
        reachable, unreachable = crawler.crawl()
        all_devs = reachable + unreachable

        snap_id = db.save_snapshot(
            reachable_devices=reachable,
            unreachable_devices=unreachable,
            seed_devices=seeds,
            duration_seconds=1.5,
        )

        analyzer = TopologyAnalyzer(all_devs)
        vis = NetworkMapVisualizer(analyzer, maps_dir=maps_dir)
        vis.generate_html_map(snapshot_id=snap_id)
        vis.generate_svg_map(snapshot_id=snap_id)

        return {
            "snapshot_id": snap_id,
            "reachable_count": len(reachable),
            "unreachable_count": len(unreachable),
            "message": f"Crawl completed. Snapshot {snap_id} created.",
        }

    @app.get("/api/diff/{snap1_id}/{snap2_id}")
    def get_diff(snap1_id: int, snap2_id: int):
        return diff_snapshots(db, snap1_id, snap2_id)

    @app.get("/api/audit")
    def get_audit_trail(
        limit: int = 100,
        event_type: Optional[str] = None,
        hostname: Optional[str] = None,
        severity: Optional[str] = None,
    ):
        from netcrawl.audit.logger import get_audit_logger
        audit = get_audit_logger(db_path=db_path)
        return audit.get_events(limit=limit, event_type=event_type, hostname=hostname, severity=severity)

    @app.get("/", response_class=HTMLResponse)
    def index():
        template_file = Path(__file__).parent / "templates" / "index.html"
        if template_file.exists():
            with open(template_file, "r", encoding="utf-8") as f:
                return f.read()
        return "<h1>NetCrawl Web UI</h1><p>Template missing.</p>"

    return app
