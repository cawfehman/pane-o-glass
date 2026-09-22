"""Unified CLI entrypoint for NetCrawl."""

from __future__ import annotations
import argparse
import os
import sys
import time
from pathlib import Path
import yaml
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from netcrawl.crawler.engine import NetworkCrawler
from netcrawl.models import DeviceStatus
from netcrawl.scheduler.job_runner import CrawlScheduler, diff_snapshots
from netcrawl.storage.database import DatabaseManager
from netcrawl.topology.analyzer import TopologyAnalyzer
from netcrawl.tracer.path_tracer import PathTracer
from netcrawl.visualizer.map_generator import NetworkMapVisualizer

console = Console(highlight=False)


def load_config(config_path: str = "config.yaml") -> dict:
    if Path(config_path).exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def cmd_crawl(args, cfg: dict):
    import getpass

    seeds = args.seeds.split(",") if args.seeds else cfg.get("crawler", {}).get("seed_devices", ["10.100.1.1"])
    username = args.username or os.getenv("NETCRAWL_USER") or cfg.get("crawler", {}).get("credentials", {}).get("username", "admin")
    
    # Password resolution: CLI --ask-pass prompt > CLI --password > env NETCRAWL_PASS > config.yaml
    if getattr(args, "ask_pass", False):
        password = getpass.getpass(f"Enter SSH password for '{username}': ")
        secret = getpass.getpass("Enter Enable secret (press Enter if none): ")
    else:
        password = args.password or os.getenv("NETCRAWL_PASS") or cfg.get("crawler", {}).get("credentials", {}).get("password", "cisco")
        secret = args.secret or os.getenv("NETCRAWL_SECRET") or cfg.get("crawler", {}).get("credentials", {}).get("secret", "")

    key_file = args.key_file or os.getenv("NETCRAWL_KEY_FILE") or cfg.get("crawler", {}).get("credentials", {}).get("key_file")
    
    # Fallback credentials resolution: CLI --fallback-json > env NETCRAWL_FALLBACK_JSON > env NETCRAWL_FALLBACK_USER_X > config.yaml
    fallback_creds = []
    fallback_json_raw = getattr(args, "fallback_json", None) or os.getenv("NETCRAWL_FALLBACK_JSON")
    if fallback_json_raw:
        try:
            import json
            parsed = json.loads(fallback_json_raw)
            if isinstance(parsed, list):
                fallback_creds = [
                    {
                        "username": str(f.get("username", "")).strip(),
                        "password": str(f.get("password", "")),
                        "secret": str(f.get("secret", "")),
                        "key_file": f.get("key_file")
                    }
                    for f in parsed if f.get("username") or f.get("password")
                ]
        except Exception as e:
            console.print(f"[yellow]Warning: Failed parsing fallback credentials JSON: {e}[/yellow]")

    if not fallback_creds:
        # Check for indexed environment variables (e.g. NETCRAWL_FALLBACK_USER_1, NETCRAWL_FALLBACK_PASS_1, NETCRAWL_FALLBACK_SECRET_1)
        idx = 1
        while True:
            fb_u = os.getenv(f"NETCRAWL_FALLBACK_USER_{idx}")
            if not fb_u:
                break
            fb_p = os.getenv(f"NETCRAWL_FALLBACK_PASS_{idx}", "")
            fb_s = os.getenv(f"NETCRAWL_FALLBACK_SECRET_{idx}", "")
            fallback_creds.append({
                "username": fb_u.strip(),
                "password": fb_p,
                "secret": fb_s
            })
            idx += 1

    if not fallback_creds:
        fallback_creds = cfg.get("crawler", {}).get("fallback_credentials", [])

    workers = args.workers or cfg.get("crawler", {}).get("max_workers", 15)
    use_mock = args.mock

    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    snapshots_dir = cfg.get("storage", {}).get("snapshots_dir", "snapshots")
    maps_dir = cfg.get("storage", {}).get("maps_dir", "maps")

    console.print(Panel.fit(
        f"[bold cyan]NetCrawl Network Discovery[/bold cyan]\n"
        f"Seeds: [yellow]{', '.join(seeds)}[/yellow]\n"
        f"Auth User: [white]{username}[/white] | Key: [dim]{key_file or 'None'}[/dim] | Fallbacks: [cyan]{len(fallback_creds)} profile(s)[/cyan]\n"
        f"Mode: [green]{'VIRTUAL MOCK LAB' if use_mock else 'LIVE SSH (Strict Read-Only)'}[/green]\n"
        f"Concurrency: [cyan]{workers} workers[/cyan]",
        title="[CRAWLER START]",
    ))

    db = DatabaseManager(db_path=db_path, snapshots_dir=snapshots_dir)

    def progress_cb(level: str, msg: str):
        color = "cyan"
        if level == "success":
            color = "green"
        elif level == "warning":
            color = "red"
        elif level == "spider":
            color = "yellow"
        console.print(f"[{color}][{level.upper()}][/{color}] {msg}")

    crawler = NetworkCrawler(
        seed_devices=seeds,
        username=username,
        password=password,
        secret=secret,
        key_file=key_file,
        fallback_credentials=fallback_creds,
        max_workers=workers,
        use_mock=use_mock,
        crawl_profile=getattr(args, "profile", "intensive") or "intensive",
        max_hops=getattr(args, "max_hops", 1),
        enable_lldp=getattr(args, "enable_lldp", False),
        lldp_fallback_on_cdp_fail=not getattr(args, "no_lldp_fallback", False),
        hostname_regex=cfg.get("crawler", {}).get("hostname_regex"),
        excluded_platform_patterns=cfg.get("crawler", {}).get("filters", {}).get("excluded_platform_patterns"),
        excluded_role_patterns=cfg.get("crawler", {}).get("filters", {}).get("excluded_role_patterns"),
        progress_callback=progress_cb,
    )

    start = time.time()
    reachable, unreachable = crawler.crawl()
    duration = time.time() - start

    snap_id = db.save_snapshot(
        reachable_devices=reachable,
        unreachable_devices=unreachable,
        seed_devices=seeds,
        duration_seconds=duration,
        crawl_profile=getattr(args, "profile", "intensive") or "intensive",
        max_hops=getattr(args, "max_hops", 1),
        reseed_points=crawler.reseed_points,
        unverified_devices=crawler.unverified_devices,
    )

    # Topology and Map Generation
    all_devs = reachable + unreachable + crawler.unverified_devices
    analyzer = TopologyAnalyzer(all_devs)
    vis = NetworkMapVisualizer(analyzer, maps_dir=maps_dir)
    html_map = vis.generate_html_map(snapshot_id=snap_id)
    svg_map = vis.generate_svg_map(snapshot_id=snap_id)

    reseed_info = f"Reseed Frontier Points: [yellow]{len(crawler.reseed_points)}[/yellow]\n" if crawler.reseed_points else ""

    console.print()
    console.print(Panel.fit(
        f"[bold green][OK] Crawl Complete![/bold green]\n"
        f"Snapshot ID: [bold white]{snap_id}[/bold white]\n"
        f"Reachable Devices: [green]{len(reachable)}[/green]\n"
        f"Failed/Unreachable Devices: [red]{len(unreachable)}[/red]\n"
        f"{reseed_info}"
        f"Total Links Correlated: [cyan]{len(analyzer.links)}[/cyan]\n"
        f"Interactive Map: [blue]{html_map}[/blue]\n"
        f"Vector SVG Map: [blue]{svg_map}[/blue]",
        title="CRAWL RESULTS",
    ))


def cmd_map(args, cfg: dict):
    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    maps_dir = cfg.get("storage", {}).get("maps_dir", "maps")
    db = DatabaseManager(db_path=db_path)

    snap_id = args.snapshot or db.get_latest_snapshot_id()
    if not snap_id:
        console.print("[red]No snapshots found. Run 'crawl' first.[/red]")
        return

    devices = db.get_devices_for_snapshot(snap_id)
    analyzer = TopologyAnalyzer(devices)
    vis = NetworkMapVisualizer(analyzer, maps_dir=maps_dir)
    html_path = vis.generate_html_map(snapshot_id=snap_id)
    svg_path = vis.generate_svg_map(snapshot_id=snap_id)

    console.print(f"[green][OK] Generated Interactive Map:[/green] {html_path}")
    console.print(f"[green][OK] Generated Vector SVG Map:[/green] {svg_path}")


def cmd_trace(args, cfg: dict):
    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    db = DatabaseManager(db_path=db_path)

    snap_id = args.snapshot or db.get_latest_snapshot_id()
    if not snap_id:
        console.print("[red]No snapshots found. Run 'crawl' first.[/red]")
        return

    devices = db.get_devices_for_snapshot(snap_id)
    tracer = PathTracer(devices)
    hops, delivered, message = tracer.trace(args.src, args.dst)

    console.print(Panel.fit(
        f"Source IP: [bold yellow]{args.src}[/bold yellow] -> Destination IP: [bold yellow]{args.dst}[/bold yellow]\n"
        f"Snapshot: #{snap_id} | Status: [{'green' if delivered else 'red'}]{message}[/{'green' if delivered else 'red'}]",
        title="HOP-BY-HOP PATH TRACE SIMULATION",
    ))

    table = Table(title="Traversed Forwarding Path", header_style="bold cyan")
    table.add_column("Hop #", justify="center")
    table.add_column("Device Name", style="bold white")
    table.add_column("Role", style="magenta")
    table.add_column("Ingress Port", style="green")
    table.add_column("Egress Port", style="blue")
    table.add_column("Matched Route / Next Hop", style="yellow")
    table.add_column("Forwarding Decision", style="white")

    for h in hops:
        route_info = f"{h.matched_route or '-'} (via {h.next_hop_ip or '-'})" if h.matched_route else (h.next_hop_ip or "-")
        table.add_row(
            str(h.hop_number),
            f"{h.device_name}\n({h.device_ip})",
            h.role,
            h.ingress_interface or "-",
            h.egress_interface or "-",
            route_info,
            f"[{'green' if 'ROUTED' in h.forwarding_type or 'SWITCHED' in h.forwarding_type or 'TERMINAL' in h.forwarding_type else 'red'}]{h.forwarding_type}[/]\n{h.notes}",
        )

    console.print(table)


def cmd_failed(args, cfg: dict):
    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    db = DatabaseManager(db_path=db_path)

    snap_id = args.snapshot or db.get_latest_snapshot_id()
    if not snap_id:
        console.print("[red]No snapshots found.[/red]")
        return

    unreach = db.get_unreachable_devices(snap_id)
    if not unreach:
        console.print(f"[bold green][OK] All devices reachable in Snapshot #{snap_id}. No investigations needed![/bold green]")
        return

    table = Table(title=f"[ALERT] Unreachable Devices Flagged for Investigation (Snapshot #{snap_id})", header_style="bold red")
    table.add_column("Hostname", style="bold white")
    table.add_column("IP Address", style="yellow")
    table.add_column("Site / IDF", style="cyan")
    table.add_column("Status", style="red")
    table.add_column("Failure Diagnostic", style="white")
    table.add_column("Discovered Via", style="blue")

    for d in unreach:
        site_str = f"{d['site']} / {d['idf']}" if d.get("site") else "N/A"
        table.add_row(
            d["hostname"],
            d["ip_address"],
            site_str,
            d["status"],
            d["failure_reason"] or "Connection Failed",
            d["discovered_via"] or "Direct Seed",
        )

    console.print(table)


def cmd_diff(args, cfg: dict):
    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    db = DatabaseManager(db_path=db_path)

    diff = diff_snapshots(db, args.snap1, args.snap2)
    console.print(Panel.fit(
        f"Comparing Snapshot #{args.snap1} -> Snapshot #{args.snap2}",
        title="SNAPSHOT TOPOLOGY DIFF",
    ))

    if diff["added_devices"]:
        console.print(f"[green]+ Added Devices ({len(diff['added_devices'])}):[/green] " + ", ".join(d["hostname"] for d in diff["added_devices"]))
    if diff["removed_devices"]:
        console.print(f"[red]- Removed Devices ({len(diff['removed_devices'])}):[/red] " + ", ".join(d["hostname"] for d in diff["removed_devices"]))
    if diff["status_changes"]:
        console.print(f"[yellow]Status Changes ({len(diff['status_changes'])}):[/yellow]")
        for sc in diff["status_changes"]:
            console.print(f"  * {sc['hostname']}: {sc['old_status']} -> {sc['new_status']} ({sc['failure_reason']})")
    if diff["route_changes"]:
        console.print(f"[cyan]Route Changes ({len(diff['route_changes'])}):[/cyan]")
        for rc in diff["route_changes"]:
            console.print(f"  * {rc['hostname']}: +{len(rc['added_routes'])} routes, -{len(rc['removed_routes'])} routes")

    if not (diff["added_devices"] or diff["removed_devices"] or diff["status_changes"] or diff["route_changes"]):
        console.print("[dim green]No topology differences found between snapshots.[/dim green]")


def cmd_web(args, cfg: dict):
    port = args.port or cfg.get("web", {}).get("port", 8080)
    host = args.host or cfg.get("web", {}).get("host", "0.0.0.0")
    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    snapshots_dir = cfg.get("storage", {}).get("snapshots_dir", "snapshots")
    maps_dir = cfg.get("storage", {}).get("maps_dir", "maps")

    console.print(Panel.fit(
        f"Web Dashboard URL: [bold cyan]http://localhost:{port}[/bold cyan]\n"
        f"Listening on: [yellow]{host}:{port}[/yellow]\n"
        f"Press Ctrl+C to stop.",
        title="NETCRAWL WEB INTERFACE",
    ))

    import uvicorn
    from netcrawl.web.app import create_app

    app = create_app(db_path=db_path, snapshots_dir=snapshots_dir, maps_dir=maps_dir)
    uvicorn.run(app, host=host, port=port)


def cmd_audit(args, cfg: dict):
    db_path = cfg.get("storage", {}).get("database_path", "data/crawler.db")
    from netcrawl.audit.logger import get_audit_logger
    audit = get_audit_logger(db_path=db_path)

    events = audit.get_events(
        limit=args.limit,
        event_type=args.event_type,
        hostname=args.host,
        severity=args.severity,
    )

    if not events:
        console.print("[dim]No audit events found matching query.[/dim]")
        return

    table = Table(title=f"Security & Operational Audit Log (Latest {len(events)} events)", header_style="bold cyan")
    table.add_column("Timestamp", style="dim", width=19)
    table.add_column("Event Type", style="bold white")
    table.add_column("Severity", justify="center")
    table.add_column("Device / Host", style="yellow")
    table.add_column("Details", style="white")

    for ev in events:
        sev = ev["severity"]
        sev_style = "green"
        if sev == "WARNING":
            sev_style = "yellow"
        elif sev == "SECURITY_ALERT" or sev == "CRITICAL":
            sev_style = "bold red"

        det_str = ", ".join(f"{k}={v}" for k, v in ev["details"].items() if k not in ["response_bytes"])
        table.add_row(
            ev["timestamp"].replace("T", " ")[:19],
            ev["event_type"],
            f"[{sev_style}]{sev}[/{sev_style}]",
            ev["hostname"] or ev["device_ip"] or "System",
            det_str[:80] + ("..." if len(det_str) > 80 else ""),
        )

    console.print(table)


def main():
    parser = argparse.ArgumentParser(description="NetCrawl: Cisco IOS Network Crawler, Topology Analyzer & Path Tracer")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # crawl
    p_crawl = subparsers.add_parser("crawl", help="Run network crawl")
    p_crawl.add_argument("--seeds", help="Comma-separated seed IPs")
    p_crawl.add_argument("--username", help="SSH username")
    p_crawl.add_argument("--password", help="SSH password")
    p_crawl.add_argument("--secret", help="Enable secret")
    p_crawl.add_argument("--fallback-json", help="JSON array of fallback credentials: [{'username':..., 'password':..., 'secret':...}]")
    p_crawl.add_argument("--ask-pass", action="store_true", help="Interactively prompt for password and enable secret without echoing")
    p_crawl.add_argument("--key-file", help="Path to SSH private key file (e.g. ~/.ssh/id_rsa)")
    p_crawl.add_argument("--workers", type=int, help="Thread pool size")
    p_crawl.add_argument("--mock", action="store_true", help="Run against simulated mock lab network")
    p_crawl.add_argument("--profile", choices=["discovery", "mapping", "intensive"], default="intensive", help="Crawl profile: discovery, mapping, or intensive")
    p_crawl.add_argument("--max-hops", type=int, default=1, help="Max distance in hops from seed devices (default: 1, max: 10)")
    p_crawl.add_argument("--enable-lldp", action="store_true", help="Always query LLDP neighbors in addition to CDP")
    p_crawl.add_argument("--no-lldp-fallback", action="store_true", help="Disable LLDP fallback when CDP yields no neighbors")

    # map
    p_map = subparsers.add_parser("map", help="Generate network topology map")
    p_map.add_argument("--snapshot", type=int, help="Snapshot ID (default: latest)")

    # trace
    p_trace = subparsers.add_parser("trace", help="Simulate hop-by-hop packet path")
    p_trace.add_argument("--src", required=True, help="Source IP address")
    p_trace.add_argument("--dst", required=True, help="Destination IP address")
    p_trace.add_argument("--snapshot", type=int, help="Snapshot ID (default: latest)")

    # failed / investigate
    p_failed = subparsers.add_parser("failed", help="List unreachable devices flagged for investigation")
    p_failed.add_argument("--snapshot", type=int, help="Snapshot ID (default: latest)")

    # diff
    p_diff = subparsers.add_parser("diff", help="Compare two snapshots")
    p_diff.add_argument("--snap1", type=int, required=True, help="First snapshot ID")
    p_diff.add_argument("--snap2", type=int, required=True, help="Second snapshot ID")

    # web
    p_web = subparsers.add_parser("web", help="Start web dashboard server")
    p_web.add_argument("--host", help="Bind host")
    p_web.add_argument("--port", type=int, help="Port number")

    # audit
    p_audit = subparsers.add_parser("audit", help="Query security and operational audit trail")
    p_audit.add_argument("--limit", type=int, default=30, help="Max entries to return (default 30)")
    p_audit.add_argument("--severity", help="Filter by severity (INFO, WARNING, SECURITY_ALERT)")
    p_audit.add_argument("--event-type", help="Filter by event type")
    p_audit.add_argument("--host", help="Filter by device hostname or IP")

    args = parser.parse_args()
    cfg = load_config(args.config)

    dispatch = {
        "crawl": cmd_crawl,
        "map": cmd_map,
        "trace": cmd_trace,
        "failed": cmd_failed,
        "diff": cmd_diff,
        "web": cmd_web,
        "audit": cmd_audit,
    }
    dispatch[args.command](args, cfg)


if __name__ == "__main__":
    main()
