"""Tests for Telnet probing, opt-in fallback crawling, and SSH migration tagging."""

import os
import pytest
from unittest.mock import MagicMock, patch

from netcrawl.crawler.ssh_client import CiscoSSHClient, probe_telnet_service
from netcrawl.crawler.engine import NetworkCrawler
from netcrawl.models import Device, DeviceStatus, DeviceRole
from netcrawl.storage.database import DatabaseManager


def test_probe_telnet_service_closed():
    with patch("socket.socket") as mock_sock_cls:
        mock_sock = MagicMock()
        mock_sock.connect_ex.return_value = 111 # ECONNREFUSED
        mock_sock_cls.return_value.__enter__.return_value = mock_sock

        is_open, banner = probe_telnet_service("10.15.10.127", timeout=1.0)
        assert is_open is False
        assert banner is None


def test_probe_telnet_service_open():
    with patch("socket.socket") as mock_sock_cls:
        mock_sock = MagicMock()
        mock_sock.connect_ex.return_value = 0
        mock_sock.recv.return_value = b"\xff\xfb\x01\xff\xfb\x03User Access Verification"
        mock_sock_cls.return_value.__enter__.return_value = mock_sock

        is_open, banner = probe_telnet_service("10.15.10.127", timeout=1.0)
        assert is_open is True
        assert "User Access Verification" in banner


def test_cisco_ssh_client_telnet_initialization():
    client = CiscoSSHClient(
        host="10.15.10.127",
        username="admin",
        password="secretpassword",
        protocol="telnet"
    )
    assert client.protocol == "telnet"
    assert client.port == 23
    assert client.device_type == "cisco_ios_telnet"


def test_crawler_telnet_probe_when_ssh_fails_and_telnet_disabled():
    crawler = NetworkCrawler(
        seed_devices=["10.15.10.127"],
        username="admin",
        password="pwd",
        allow_telnet=False, # Default: Cleartext Telnet fallback is disabled
        use_mock=False,
    )
    crawler.known_hostname_map["10.15.10.127"] = "CRMC-DC-AS01"

    with patch.object(CiscoSSHClient, "connect", return_value=(False, "Connection timed out on port 22")), \
         patch("netcrawl.crawler.engine.probe_telnet_service", return_value=(True, "Cisco IOS Telnet")):
        
        dev = crawler._crawl_single_device("10.15.10.127", current_hop=0)

        assert dev.status == DeviceStatus.UNREACHABLE
        assert dev.hostname == "CRMC-DC-AS01"
        assert dev.protocol == "telnet"
        assert dev.telnet_detected is True
        assert dev.requires_ssh_migration is True
        assert "TELNET_DETECTED_SSH_DISABLED" in dev.failure_reason
        assert "crypto key generate rsa" in dev.failure_reason


def test_crawler_telnet_probe_when_ssh_fails_and_telnet_approved():
    crawler = NetworkCrawler(
        seed_devices=["10.15.10.127"],
        username="admin",
        password="pwd",
        allow_telnet=True, # User explicitly checked "Allow Cleartext Telnet Fallback"
        use_mock=False,
    )
    crawler.known_hostname_map["10.15.10.127"] = "CRMC-DC-AS01"

    def mock_connect(self):
        if getattr(self, "protocol", "ssh") == "telnet":
            return (True, None)
        return (False, "SSH port 22 closed")

    def mock_send(self, cmd):
        if "show version" in cmd:
            return "Cisco IOS Software, C2960 Software, Version 12.2(55)SE12, RELEASE SOFTWARE\nhostname CRMC-DC-AS01\n"
        return ""

    with patch.object(CiscoSSHClient, "connect", mock_connect), \
         patch.object(CiscoSSHClient, "send_command", mock_send), \
         patch.object(CiscoSSHClient, "disconnect", return_value=None), \
         patch("netcrawl.crawler.engine.probe_telnet_service", return_value=(True, "Cisco IOS Telnet")):
        
        dev = crawler._crawl_single_device("10.15.10.127", current_hop=0)

        assert dev.status == DeviceStatus.REACHABLE
        assert dev.hostname == "CRMC-DC-AS01"
        assert dev.protocol == "telnet"
        assert dev.telnet_detected is True
        assert dev.requires_ssh_migration is True
        assert dev.security_warning is not None
        assert "UNENCRYPTED_TELNET" in dev.security_warning


def test_database_persistence_telnet_fields(tmp_path):
    db_path = str(tmp_path / "test_crawler.db")
    snap_dir = str(tmp_path / "snapshots")
    db = DatabaseManager(db_path=db_path, snapshots_dir=snap_dir)

    unreach_dev = Device(
        hostname="CRMC-DC-AS01",
        ip_address="10.15.10.127",
        status=DeviceStatus.UNREACHABLE,
        failure_reason="TELNET_DETECTED_SSH_DISABLED: Switch has SSH disabled",
        protocol="telnet",
        telnet_detected=True,
        requires_ssh_migration=True,
        security_warning="CLEARTEXT_TELNET_ONLY: Device requires SSH configuration",
    )

    reach_dev = Device(
        hostname="CRMC-DC-AS02",
        ip_address="10.15.10.128",
        status=DeviceStatus.REACHABLE,
        protocol="telnet",
        telnet_detected=True,
        requires_ssh_migration=True,
        security_warning="UNENCRYPTED_TELNET: Crawled over unencrypted Telnet",
    )

    snap_id = db.save_snapshot(
        reachable_devices=[reach_dev],
        unreachable_devices=[unreach_dev],
        seed_devices=["10.15.10.127", "10.15.10.128"],
        duration_seconds=1.5,
    )

    devices = db.get_devices_for_snapshot(snap_id)
    assert len(devices) == 2
    dev_map = {d.hostname: d for d in devices}

    as01 = dev_map["CRMC-DC-AS01"]
    assert as01.protocol == "telnet"
    assert as01.telnet_detected is True
    assert as01.requires_ssh_migration is True
    assert "TELNET_DETECTED" in as01.failure_reason

    as02 = dev_map["CRMC-DC-AS02"]
    assert as02.protocol == "telnet"
    assert as02.telnet_detected is True
    assert as02.requires_ssh_migration is True
    assert "UNENCRYPTED_TELNET" in as02.security_warning

    unreach = db.get_unreachable_devices(snap_id)
    assert len(unreach) == 1
    assert unreach[0]["hostname"] == "CRMC-DC-AS01"
    assert unreach[0]["protocol"] == "telnet"
    assert bool(unreach[0]["telnet_detected"]) is True
    assert bool(unreach[0]["requires_ssh_migration"]) is True


def test_mask_sensitive_data_telnet_session_buffer():
    from netcrawl.audit.sanitizer import mask_sensitive_data

    raw_error = (
        "NetmikoAuthenticationException: Authentication failure: unable to finish login on: 10.15.10.127\n"
        "Pattern not detected: \n"
        "Buffer: User Access Verification\r\n"
        "Username: admin\r\n"
        "Password: SuperSecretP@ssword123\r\n"
        "% Login invalid\r\n"
    )

    masked = mask_sensitive_data(raw_error, secret_words=["SuperSecretP@ssword123"])
    assert "SuperSecretP@ssword123" not in masked
    assert "Password: [REDACTED" in masked


def test_cisco_client_obfuscates_password_in_exception():
    client = CiscoSSHClient(
        host="10.15.10.127",
        username="admin",
        password="MySecretTelnetPassword",
        protocol="telnet"
    )

    with patch("netmiko.ConnectHandler", side_effect=Exception("Failed login Buffer: Password: MySecretTelnetPassword")):
        success, err = client.connect()
        assert success is False
        assert "MySecretTelnetPassword" not in err
        assert "[REDACTED" in err

