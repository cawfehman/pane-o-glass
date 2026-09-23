"""Structured audit and compliance logging engine for NetCrawl."""

from __future__ import annotations
import atexit
from datetime import datetime
import json
import logging
import os
from pathlib import Path
import queue
import sqlite3
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger("netcrawl.audit")


class AuditLogger:
    """Manages structured JSON-Lines audit trails, raw command archives, and SQLite audit tables with async queue serialization."""

    def __init__(self, db_path: str = "data/crawler.db", log_dir: str = "logs"):
        self.db_path = Path(db_path)
        self.log_dir = Path(log_dir)
        self.audit_file = self.log_dir / "audit.jsonl"
        self.raw_responses_dir = self.log_dir / "raw_responses"
        self.disabled_sqlite = os.getenv("NETCRAWL_DISABLE_SQLITE", "").lower() in ("1", "true", "yes")

        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.raw_responses_dir.mkdir(parents=True, exist_ok=True)

        if not self.disabled_sqlite:
            self._init_audit_table()
            self._queue: Optional[queue.Queue] = queue.Queue()
            self._stop_event = threading.Event()
            self._worker: Optional[threading.Thread] = threading.Thread(
                target=self._sqlite_worker, 
                daemon=True, 
                name="AuditLoggerWorker"
            )
            self._worker.start()
            atexit.register(self.close)
        else:
            self._queue = None
            self._worker = None

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=60.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA busy_timeout=60000;")
        except Exception:
            pass
        return conn

    def _init_audit_table(self) -> None:
        """Create audit_events table in SQLite if not exists."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                device_ip TEXT,
                hostname TEXT,
                initiator TEXT,
                details_json TEXT NOT NULL
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(timestamp);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(event_type);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_host ON audit_events(hostname);")
            conn.commit()

    def _sqlite_worker(self) -> None:
        """Dedicated background writer thread to serialize all SQLite writes with zero lock contention."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            while True:
                try:
                    item = self._queue.get(timeout=0.2)
                except queue.Empty:
                    if self._stop_event.is_set():
                        break
                    continue

                if item is None:
                    self._queue.task_done()
                    break

                try:
                    cursor.execute(
                        """
                        INSERT INTO audit_events (timestamp, event_type, severity, device_ip, hostname, initiator, details_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        item,
                    )
                    conn.commit()
                except Exception as exc:
                    logger.error(f"Failed to record audit event to SQLite: {exc}")
                finally:
                    self._queue.task_done()
        except Exception as exc:
            logger.error(f"Audit logger worker encountered an error: {exc}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def log(
        self,
        event_type: str,
        severity: str = "INFO",
        device_ip: Optional[str] = None,
        hostname: Optional[str] = None,
        initiator: str = "system",
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Record an audit event to SQLite (non-blocking queue), JSON-Lines file, and system logger."""
        ts = datetime.now().isoformat()
        details_dict = details or {}
        details_str = json.dumps(details_dict)

        # 1. SQLite record (via non-blocking asynchronous queue to eliminate thread contention)
        if not self.disabled_sqlite and self._queue is not None:
            try:
                self._queue.put_nowait((ts, event_type, severity, device_ip, hostname, initiator, details_str))
            except Exception as exc:
                logger.error(f"Failed to enqueue audit event: {exc}")

        # 2. JSON-Lines audit log file (append-only)
        audit_entry = {
            "timestamp": ts,
            "event_type": event_type,
            "severity": severity,
            "device_ip": device_ip,
            "hostname": hostname,
            "initiator": initiator,
            "details": details_dict,
        }
        try:
            with open(self.audit_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(audit_entry) + "\n")
        except Exception as exc:
            logger.error(f"Failed to write to audit.jsonl: {exc}")

        # 3. Python logging
        log_msg = f"[{severity}] [{event_type}] host={hostname or device_ip or 'N/A'} details={details_str}"
        if severity == "SECURITY_ALERT" or severity == "CRITICAL":
            logger.critical(log_msg)
        elif severity == "WARNING":
            logger.warning(log_msg)
        else:
            logger.info(log_msg)

    def flush(self) -> None:
        """Wait for all pending in-memory audit logs to be flushed to SQLite."""
        if self._queue is not None:
            self._queue.join()

    def close(self) -> None:
        """Drain queue and safely terminate background SQLite worker."""
        if self._worker is not None and self._worker.is_alive():
            self.flush()
            self._stop_event.set()
            self._queue.put(None)
            self._worker.join(timeout=3.0)

    def archive_command_response(
        self,
        snapshot_id: Optional[int],
        device_hostname: str,
        device_ip: str,
        command: str,
        response_output: str,
    ) -> Path:
        """Archive verbatim Cisco IOS command output to disk for compliance and forensics."""
        snap_folder = f"snapshot_{snapshot_id}" if snapshot_id else "ad_hoc"
        target_dir = self.raw_responses_dir / snap_folder / f"{device_hostname}_{device_ip}"
        target_dir.mkdir(parents=True, exist_ok=True)

        safe_cmd = command.strip().replace(" ", "_").replace("/", "_")
        target_file = target_dir / f"{safe_cmd}.txt"

        header = (
            f"================================================================================\n"
            f"AUDIT ARCHIVE: COMMAND RESPONSE\n"
            f"Timestamp: {datetime.now().isoformat()}\n"
            f"Device: {device_hostname} ({device_ip})\n"
            f"Command: {command}\n"
            f"Snapshot ID: {snapshot_id or 'N/A'}\n"
            f"================================================================================\n\n"
        )
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(header + response_output)

        return target_file

    def get_events(
        self,
        limit: int = 100,
        event_type: Optional[str] = None,
        hostname: Optional[str] = None,
        severity: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Query audit log events from SQLite with optional filtering."""
        if self.disabled_sqlite:
            return []

        # Flush any pending async writes before querying
        self.flush()

        query = "SELECT * FROM audit_events WHERE 1=1"
        params: List[Any] = []

        if event_type:
            query += " AND event_type = ?"
            params.append(event_type)
        if hostname:
            query += " AND (hostname LIKE ? OR device_ip LIKE ?)"
            params.extend([f"%{hostname}%", f"%{hostname}%"])
        if severity:
            query += " AND severity = ?"
            params.append(severity)

        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "event_type": r["event_type"],
                    "severity": r["severity"],
                    "device_ip": r["device_ip"],
                    "hostname": r["hostname"],
                    "initiator": r["initiator"],
                    "details": json.loads(r["details_json"]),
                })
            return results


# Global singleton instance for easy import
_default_audit_logger: Optional[AuditLogger] = None


def get_audit_logger(db_path: str = "data/crawler.db", log_dir: str = "logs") -> AuditLogger:
    global _default_audit_logger
    if _default_audit_logger is None:
        _default_audit_logger = AuditLogger(db_path=db_path, log_dir=log_dir)
    return _default_audit_logger
