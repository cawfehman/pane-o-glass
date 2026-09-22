"""Unit and integration tests for network crawling, topology analysis, and path tracing."""

import pytest
from netcrawl.crawler.engine import NetworkCrawler
from netcrawl.crawler.mock_network import MOCK_TOPOLOGY_DATA
from netcrawl.models import DeviceStatus
from netcrawl.storage.database import DatabaseManager
from netcrawl.topology.analyzer import TopologyAnalyzer
from netcrawl.tracer.path_tracer import PathTracer


@pytest.fixture
def crawled_network(tmp_path):
    """Run mock network crawl and store in temporary SQLite database."""
    db_file = tmp_path / "test_crawler.db"
    db = DatabaseManager(db_path=str(db_file), snapshots_dir=str(tmp_path / "snaps"))

    crawler = NetworkCrawler(
        seed_devices=["10.100.1.1"],
        use_mock=True,
        max_hops=10,
    )
    reachable, unreachable = crawler.crawl()

    snap_id = db.save_snapshot(
        reachable_devices=reachable,
        unreachable_devices=unreachable,
        seed_devices=["10.100.1.1"],
        duration_seconds=0.5,
    )
    return db, snap_id, reachable + unreachable


def test_crawl_discovery_and_unreachable_flag(crawled_network):
    """Verify that crawler spiders through CDP, skips APs, and flags unreachable switch."""
    db, snap_id, all_devices = crawled_network
    analyzer = TopologyAnalyzer(all_devices)
    summary = analyzer.get_summary()

    # Reachable count should be 7, Unreachable count should be 1 (101-id3-swas-1)
    assert summary["reachable"] == 7
    assert summary["unreachable"] == 1

    # Verify that unreachable switch is detected and flagged
    unreachable_list = db.get_unreachable_devices(snap_id)
    assert len(unreachable_list) == 1
    unreach = unreachable_list[0]
    assert unreach["hostname"] == "101-id3-swas-1"
    assert unreach["status"] == "TIMEOUT"
    assert "Discovered via" in unreach["discovered_via"] or "101-mdf-swds-1" in unreach["discovered_via"]

    # Verify that Wireless AP (101-id1-wlap-1) was skipped and NOT in crawled devices
    hostnames = [d.hostname for d in all_devices]
    assert not any("wlap" in h.lower() for h in hostnames)


def test_path_tracer_inter_site(crawled_network):
    """Verify hop-by-hop forwarding simulation from Site 101 to Site 202."""
    db, snap_id, all_devices = crawled_network
    tracer = PathTracer(all_devices)

    # Trace from Workstation at Site 101 (10.10.10.50) to Remote Server at Site 202 (10.20.50.88)
    hops, delivered, message = tracer.trace("10.10.10.50", "10.20.50.88")

    assert delivered is True
    assert len(hops) >= 4

    hop_devs = [h.device_name for h in hops]
    # Should traverse: Access switch -> Dist switch -> Core Router -> Remote Core -> Remote Dist -> Remote Access
    assert "101-id1-swas-1" in hop_devs
    assert "101-mdf-swds-1" in hop_devs
    assert "101-mdf-cr01-1" in hop_devs
    assert "202-mdf-cr01-1" in hop_devs
    assert "202-mdf-swds-1" in hop_devs


def test_path_tracer_intra_site_inter_vlan(crawled_network):
    """Verify local routing between VLAN 10 and VLAN 30 on same distribution switch."""
    db, snap_id, all_devices = crawled_network
    tracer = PathTracer(all_devices)

    # From 10.10.10.50 (VLAN 10) to 10.10.30.100 (VLAN 30)
    hops, delivered, message = tracer.trace("10.10.10.50", "10.10.30.100")

    assert delivered is True
    hop_devs = [h.device_name for h in hops]
    assert "101-id1-swas-1" in hop_devs
    assert "101-mdf-swds-1" in hop_devs
    assert "101-id2-swas-1" in hop_devs


def test_hop_depth_limit_and_reseed_frontier():
    """Verify that max_hops=1 halts expansion, flags reseed frontiers, and collects unvisited neighbors."""
    crawler = NetworkCrawler(
        seed_devices=["10.100.1.1"],
        use_mock=True,
        max_hops=1,
    )
    reachable, unreachable = crawler.crawl()

    # With seed at 101-mdf-cr01-1 (hop 0), hop 1 reaches 101-mdf-swds-1 and 202-mdf-cr01-1
    assert len(reachable) == 3
    assert len(crawler.reseed_points) > 0

    # 101-mdf-swds-1 is at hop 1 and has unvisited access switches at hop 2
    swds = next(d for d in reachable if d.hostname == "101-mdf-swds-1")
    assert swds.hop_distance == 1
    assert swds.is_reseed_frontier is True
    assert len(swds.boundary_neighbors) > 0

    boundary_hosts = [b["destination_host"] for b in swds.boundary_neighbors]
    assert "101-id1-swas-1" in boundary_hosts
    assert "101-id2-swas-1" in boundary_hosts
