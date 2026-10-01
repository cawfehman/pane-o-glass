"""Safe read-only SSH connector for Cisco IOS devices."""

from __future__ import annotations
import logging
import re
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class ConfigModeForbiddenError(Exception):
    """Raised when an attempt is made to execute any command that could modify configuration or enter config mode."""
    pass


# Strict Whitelist of allowed command prefixes
ALLOWED_COMMAND_PATTERNS = [
    r"^show\s+",
    r"^terminal\s+(?:length\s+0|width\s+[0-9]+)$",
]

# Strict Blacklist to prevent command chaining / configuration injection
FORBIDDEN_INJECTION_PATTERNS = [
    r"[;&|]\s*conf",
    r"[;&|]\s*write",
    r"[;&|]\s*erase",
    r"[;&|]\s*reload",
    r"\bconf(?:ig(?:ure)?)?\s+(?:t|term|terminal|net|memory)\b",
    r"\bwr(?:ite)?\s+(?:memory|erase|terminal)\b",
    r"\berase\s+(?:startup-config|nvram)\b",
    r"\breload\b",
    r"\bshutdown\b",
    r"\bno\s+shutdown\b",
    r"\bformat\s+flash\b",
    r"\bdelete\s+",
    r"\bclear\s+config\b",
]


def validate_readonly_command(command: str, host: Optional[str] = None) -> None:
    """
    Strict safety check: ensure the command is purely read-only and never enters config mode.
    Raises ConfigModeForbiddenError if any unsafe command or non-whitelisted command is detected.
    Logs any violation as a SECURITY_ALERT audit event.
    """
    cmd_clean = command.strip()

    # 1. WHITELIST: Command must explicitly start with an allowed read-only prefix
    allowed = any(re.match(pattern, cmd_clean, re.IGNORECASE) for pattern in ALLOWED_COMMAND_PATTERNS)
    if not allowed:
        err_msg = (
            f"SAFETY VIOLATION: Command '{cmd_clean}' is not on the read-only whitelist. "
            f"Only read-only 'show' and terminal formatting commands are permitted. "
            f"Configuration mode is strictly forbidden!"
        )
        try:
            from netcrawl.audit.logger import get_audit_logger
            get_audit_logger().log(
                event_type="SECURITY_VIOLATION",
                severity="SECURITY_ALERT",
                device_ip=host,
                details={"command": cmd_clean, "reason": "Command not on read-only whitelist"},
            )
        except Exception:
            pass
        raise ConfigModeForbiddenError(err_msg)

    # 2. INJECTION CHECK: Ensure no command chaining or configuration keywords within show commands
    for pattern in FORBIDDEN_INJECTION_PATTERNS:
        if re.search(pattern, cmd_clean, re.IGNORECASE):
            err_msg = (
                f"SAFETY VIOLATION: Command '{cmd_clean}' matches forbidden pattern '{pattern}'. "
                f"Global configuration mode and state-modifying commands are strictly prohibited!"
            )
            try:
                from netcrawl.audit.logger import get_audit_logger
                get_audit_logger().log(
                    event_type="SECURITY_VIOLATION",
                    severity="SECURITY_ALERT",
                    device_ip=host,
                    details={"command": cmd_clean, "pattern": pattern, "reason": "Forbidden pattern match"},
                )
            except Exception:
                pass
            raise ConfigModeForbiddenError(err_msg)


def enable_legacy_ssh_support() -> None:
    """
    Dynamically register legacy Diffie-Hellman Key Exchange (KEX) algorithms and ssh-rsa
    host keys into Paramiko.
    
    Modern Paramiko (v3.0+) deprecated 1024-bit Diffie-Hellman and SHA-1 KEX algorithms.
    Older Cisco Catalyst switches (e.g. 2960, 3560, 3750, older IOS 12/15) only support:
      - diffie-hellman-group14-sha1
      - diffie-hellman-group-exchange-sha1
      - diffie-hellman-group1-sha1
      - ssh-rsa host keys
    """
    try:
        import paramiko
        from hashlib import sha1
        from paramiko.kex_group14 import KexGroup14SHA256
        from paramiko.kex_gex import KexGexSHA256

        if "diffie-hellman-group14-sha1" in paramiko.Transport._kex_info:
            return

        class KexGroup14SHA1(KexGroup14SHA256):
            name = "diffie-hellman-group14-sha1"
            hash_algo = sha1

        class KexGroup1SHA1(KexGroup14SHA256):
            # RFC 2409 Oakley Group 2 (1024-bit MODP group)
            P = int(
                "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74"
                "020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437"
                "4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
                "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05"
                "98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB"
                "9ED529077096966D670C354E4ABC9804F1746C08CA237327FFFFFFFFFFFFFFFF",
                16,
            )
            G = 2
            name = "diffie-hellman-group1-sha1"
            hash_algo = sha1

        class KexGexSHA1(KexGexSHA256):
            name = "diffie-hellman-group-exchange-sha1"
            hash_algo = sha1

        paramiko.Transport._kex_info["diffie-hellman-group14-sha1"] = KexGroup14SHA1
        paramiko.Transport._kex_info["diffie-hellman-group-exchange-sha1"] = KexGexSHA1
        paramiko.Transport._kex_info["diffie-hellman-group1-sha1"] = KexGroup1SHA1

        for kex in ("diffie-hellman-group14-sha1", "diffie-hellman-group-exchange-sha1", "diffie-hellman-group1-sha1"):
            if kex not in paramiko.Transport._preferred_kex:
                paramiko.Transport._preferred_kex += (kex,)

        if "ssh-rsa" not in paramiko.Transport._preferred_keys:
            paramiko.Transport._preferred_keys += ("ssh-rsa",)

        logger.info("Enabled legacy SSH KEX and host-key algorithms (diffie-hellman-group14/1/gex-sha1, ssh-rsa).")
    except Exception as e:
        logger.warning("Could not register legacy SSH algorithms: %s", e)


class CiscoSSHClient:
    """Manages secure, read-only SSH connections to Cisco IOS and NX-OS devices."""
    
    def __init__(
        self,
        host: str,
        username: str,
        password: str = "",
        secret: str = "",
        key_file: Optional[str] = None,
        port: int = 22,
        timeout: int = 15,
        device_type: Optional[str] = None,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.secret = secret
        self.key_file = key_file
        self.port = port
        self.timeout = timeout
        self.device_type = device_type
        self.connection = None
        self.is_legacy_ssh = False
        self.negotiated_kex: Optional[str] = None
        self.negotiated_key: Optional[str] = None

    def connect(self) -> Tuple[bool, Optional[str]]:
        """Establish SSH connection to Cisco IOS / NX-OS device with full audit tracking."""
        from netcrawl.audit.logger import get_audit_logger
        audit = get_audit_logger()
        audit.log(
            event_type="SSH_CONNECT_ATTEMPT",
            severity="INFO",
            device_ip=self.host,
            details={
                "port": self.port,
                "user": self.username,
                "auth_method": "key" if self.key_file else "password",
                "timeout": self.timeout,
                "device_type": self.device_type or "cisco_ios",
            },
        )
        try:
            from netmiko import ConnectHandler
            
            target_device_type = self.device_type or "cisco_ios"
            device_params = {
                "device_type": target_device_type,
                "host": self.host,
                "username": self.username,
                "password": self.password,
                "secret": self.secret,
                "port": self.port,
                "conn_timeout": self.timeout,
                "auth_timeout": self.timeout,
                "banner_timeout": self.timeout,
                "global_delay_factor": 1,
            }
            if self.key_file:
                device_params["use_keys"] = True
                device_params["key_file"] = self.key_file

            enable_legacy_ssh_support()
            try:
                self.connection = ConnectHandler(**device_params)
            except Exception as initial_exc:
                err_str = str(initial_exc).lower()
                # If cisco_ios failed with prompt/driver pattern, attempt cisco_nxos fallback
                if target_device_type == "cisco_ios" and not ("authentication failed" in err_str or "password" in err_str):
                    logger.info("Retrying connection to %s using device_type='cisco_nxos'...", self.host)
                    device_params["device_type"] = "cisco_nxos"
                    self.connection = ConnectHandler(**device_params)
                    self.device_type = "cisco_nxos"
                else:
                    raise

            # Detect negotiated cryptographic algorithms from underlying Paramiko Transport
            try:
                raw_transport = getattr(getattr(self.connection, "remote_conn", None), "transport", None)
                if not raw_transport:
                    raw_client = getattr(self.connection, "remote_conn_pre", None)
                    raw_transport = getattr(raw_client, "_transport", None) or getattr(raw_client, "transport", None)

                if raw_transport:
                    kex_engine = getattr(raw_transport, "kex_engine", None)
                    if kex_engine and hasattr(kex_engine, "name"):
                        self.negotiated_kex = str(kex_engine.name)
                    remote_key = getattr(raw_transport, "host_key_type", None) or getattr(raw_transport, "remote_key", None)
                    if remote_key:
                        self.negotiated_key = str(remote_key)

                    # Flag as legacy SSH if SHA-1 KEX, group1, or older ssh-rsa was negotiated
                    if self.negotiated_kex and any(leg in self.negotiated_kex.lower() for leg in ["sha1", "group1", "diffie-hellman-group1-"]):
                        self.is_legacy_ssh = True
                    elif self.negotiated_key and "ssh-rsa" == self.negotiated_key.lower():
                        self.is_legacy_ssh = True
            except Exception as kex_diag_err:
                logger.debug("Could not inspect SSH transport algorithms on %s: %s", self.host, kex_diag_err)

            # On NX-OS, login is direct privilege 15/network-admin; enable mode does not exist
            is_nxos = getattr(self.connection, "device_type", "") == "cisco_nxos" or self.device_type == "cisco_nxos"
            if self.secret and not is_nxos:
                try:
                    if not self.connection.check_enable_mode():
                        self.connection.enable()
                except Exception as en_err:
                    en_str = str(en_err).lower()
                    if "invalid command" in en_str or "syntax error" in en_str or "unrecognized" in en_str:
                        logger.info("Enable mode unsupported on %s (likely NX-OS); proceeding without enable.", self.host)
                    else:
                        raise
                
            audit.log(
                event_type="SSH_CONNECT_SUCCESS",
                severity="INFO",
                device_ip=self.host,
                details={
                    "port": self.port,
                    "user": self.username,
                    "device_type": self.connection.device_type,
                    "is_legacy_ssh": self.is_legacy_ssh,
                    "negotiated_kex": self.negotiated_kex,
                    "negotiated_key": self.negotiated_key
                },
            )
            return True, None
        except Exception as exc:
            err_msg = str(exc)
            fail_type = "CONNECTION_ERROR"
            if "Authentication failed" in err_msg or "password" in err_msg.lower():
                fail_type = "AUTH_FAILED"
            elif "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
                fail_type = "TIMEOUT"

            audit.log(
                event_type=f"SSH_CONNECT_{fail_type}",
                severity="WARNING",
                device_ip=self.host,
                details={"port": self.port, "user": self.username, "error": err_msg},
            )
            return False, f"{fail_type}: {err_msg}"

    def send_command(self, command: str) -> str:
        """
        Send a read-only command to the device.
        Strictly enforces read-only safety before transmitting!
        Audits execution and timing.
        """
        # Enforce read-only safety guard
        validate_readonly_command(command, host=self.host)
        
        if not self.connection:
            raise RuntimeError(f"Not connected to {self.host}")
            
        import time
        from netcrawl.audit.logger import get_audit_logger
        audit = get_audit_logger()
        
        t0 = time.time()
        output = self.connection.send_command(command, read_timeout=self.timeout)
        duration = time.time() - t0
        
        audit.log(
            event_type="COMMAND_EXEC",
            severity="INFO",
            device_ip=self.host,
            details={
                "command": command,
                "duration_seconds": round(duration, 3),
                "response_bytes": len(output),
                "response_lines": len(output.splitlines()),
            },
        )
        return output

    def disconnect(self) -> None:
        """Safely close SSH session and audit disconnection."""
        if self.connection:
            try:
                self.connection.disconnect()
                from netcrawl.audit.logger import get_audit_logger
                get_audit_logger().log(
                    event_type="SSH_DISCONNECT",
                    severity="INFO",
                    device_ip=self.host,
                    details={"status": "closed"},
                )
            except Exception:
                pass
            finally:
                self.connection = None
