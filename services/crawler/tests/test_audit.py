"""Unit tests for the structured audit logger and command response archiver."""

import json
import pytest
from netcrawl.audit.logger import AuditLogger
from netcrawl.crawler.ssh_client import ConfigModeForbiddenError, validate_readonly_command


def test_audit_logging_and_jsonl(tmp_path):
    """Verify that audit records are committed to both SQLite and audit.jsonl."""
    db_file = tmp_path / "audit_test.db"
    log_dir = tmp_path / "logs"
    audit = AuditLogger(db_path=str(db_file), log_dir=str(log_dir))

    audit.log(
        event_type="CRAWL_START",
        severity="INFO",
        details={"seed": "10.100.1.1"},
    )
    audit.log(
        event_type="DEVICE_UNREACHABLE",
        severity="WARNING",
        device_ip="10.10.10.99",
        hostname="101-id3-swas-1",
        details={"reason": "SSH timeout"},
    )

    # Verify SQLite retrieval
    events = audit.get_events(limit=10)
    assert len(events) == 2
    assert events[0]["event_type"] == "DEVICE_UNREACHABLE"
    assert events[0]["severity"] == "WARNING"
    assert events[1]["event_type"] == "CRAWL_START"

    # Verify JSONL file content
    assert audit.audit_file.exists()
    lines = audit.audit_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    first_entry = json.loads(lines[0])
    assert first_entry["event_type"] == "CRAWL_START"


def test_raw_command_response_archiving(tmp_path):
    """Verify that raw show command output is archived verbatim to disk."""
    db_file = tmp_path / "audit_test.db"
    log_dir = tmp_path / "logs"
    audit = AuditLogger(db_path=str(db_file), log_dir=str(log_dir))

    sample_output = "Cisco IOS Software, Version 17.06.03\nProcessor board ID FDO2145A0BC"
    archived_file = audit.archive_command_response(
        snapshot_id=1,
        device_hostname="101-mdf-cr01-1",
        device_ip="10.100.1.1",
        command="show version",
        response_output=sample_output,
    )

    assert archived_file.exists()
    content = archived_file.read_text(encoding="utf-8")
    assert "AUDIT ARCHIVE: COMMAND RESPONSE" in content
    assert "101-mdf-cr01-1" in content
    assert "Processor board ID FDO2145A0BC" in content


def test_security_violation_audited(tmp_path, monkeypatch):
    """Verify that attempts to execute config commands trigger a SECURITY_ALERT audit event."""
    db_file = tmp_path / "audit_test.db"
    log_dir = tmp_path / "logs"
    audit = AuditLogger(db_path=str(db_file), log_dir=str(log_dir))

    # Monkeypatch default audit logger
    import netcrawl.audit.logger as audit_mod
    monkeypatch.setattr(audit_mod, "_default_audit_logger", audit)

    with pytest.raises(ConfigModeForbiddenError):
        validate_readonly_command("configure terminal", host="10.100.1.1")

    events = audit.get_events(event_type="SECURITY_VIOLATION")
    assert len(events) == 1
    assert events[0]["severity"] == "SECURITY_ALERT"
    assert events[0]["details"]["command"] == "configure terminal"


def test_concurrent_audit_logging_no_lock(tmp_path):
    """Verify that multiple concurrent threads can log audit records simultaneously without SQLite lock errors."""
    import concurrent.futures

    db_file = tmp_path / "concurrent_audit.db"
    log_dir = tmp_path / "logs"
    audit = AuditLogger(db_path=str(db_file), log_dir=str(log_dir))

    def worker(worker_id: int):
        for i in range(10):
            audit.log(
                event_type="WORKER_EVENT",
                severity="INFO",
                device_ip=f"10.0.0.{worker_id}",
                hostname=f"sw-{worker_id}",
                details={"step": i},
            )

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(worker, w) for w in range(20)]
        for f in futures:
            f.result()

    events = audit.get_events(limit=500)
    assert len(events) == 200


def test_disabled_sqlite_mode(tmp_path, monkeypatch):
    """Verify that NETCRAWL_DISABLE_SQLITE bypasses SQLite completely while preserving JSONL logging."""
    monkeypatch.setenv("NETCRAWL_DISABLE_SQLITE", "1")
    db_file = tmp_path / "should_not_exist.db"
    log_dir = tmp_path / "logs"
    audit = AuditLogger(db_path=str(db_file), log_dir=str(log_dir))

    audit.log(
        event_type="BYPASS_TEST",
        severity="INFO",
        details={"test": True},
    )

    # SQLite file should not even be created
    assert not db_file.exists()
    assert audit.disabled_sqlite is True
    assert audit.get_events() == []

    # JSONL file should still exist and record the event
    assert audit.audit_file.exists()
    lines = audit.audit_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    assert "BYPASS_TEST" in lines[0]

