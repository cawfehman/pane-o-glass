"""Automated tests for FastAPI web API and endpoints."""

import pytest
from fastapi.testclient import TestClient
from netcrawl.crawler.engine import NetworkCrawler
from netcrawl.storage.database import DatabaseManager
from netcrawl.web.app import create_app


@pytest.fixture
def test_client(tmp_path):
    db_file = tmp_path / "web_test.db"
    snaps_dir = tmp_path / "web_snaps"
    maps_dir = tmp_path / "web_maps"

    db = DatabaseManager(db_path=str(db_file), snapshots_dir=str(snaps_dir))
    crawler = NetworkCrawler(seed_devices=["10.100.1.1"], use_mock=True, max_hops=10)
    reachable, unreachable = crawler.crawl()

    snap_id = db.save_snapshot(
        reachable_devices=reachable,
        unreachable_devices=unreachable,
        seed_devices=["10.100.1.1"],
        duration_seconds=0.1,
    )

    app = create_app(db_path=str(db_file), snapshots_dir=str(snaps_dir), maps_dir=str(maps_dir))
    return TestClient(app), snap_id


def test_web_index(test_client):
    client, _ = test_client
    resp = client.get("/")
    assert resp.status_code == 200
    assert "NetCrawl" in resp.text
    assert "Topology Map" in resp.text


def test_web_snapshots_api(test_client):
    client, snap_id = test_client
    resp = client.get("/api/snapshots")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["snapshot_id"] == snap_id


def test_web_snapshot_detail_api(test_client):
    client, snap_id = test_client
    resp = client.get(f"/api/snapshot/{snap_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "devices" in data
    assert "links" in data
    assert len(data["devices"]) == 8


def test_web_unreachable_api(test_client):
    client, snap_id = test_client
    resp = client.get(f"/api/unreachable?snapshot_id={snap_id}")
    assert resp.status_code == 200
    unreach = resp.json()
    assert len(unreach) == 1
    assert unreach[0]["hostname"] == "101-id3-swas-1"


def test_web_path_trace_api(test_client):
    client, snap_id = test_client
    payload = {
        "source_ip": "10.10.10.50",
        "dest_ip": "10.20.50.88",
        "snapshot_id": snap_id,
    }
    resp = client.post("/api/trace", json=payload)
    assert resp.status_code == 200
    res = resp.json()
    assert res["delivered"] is True
    assert len(res["hops"]) >= 5


def test_web_svg_api(test_client):
    client, snap_id = test_client
    resp = client.get(f"/api/snapshot/{snap_id}/svg")
    assert resp.status_code == 200
    assert "<svg" in resp.text
