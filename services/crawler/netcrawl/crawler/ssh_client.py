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


class CiscoSSHClient:
    """Manages secure, read-only SSH connections to Cisco IOS devices."""
    
    def __init__(
        self,
        host: str,
        username: str,
        password: str = "",
        secret: str = "",
        key_file: Optional[str] = None,
        port: int = 22,
        timeout: int = 15,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.secret = secret
        self.key_file = key_file
        self.port = port
        self.timeout = timeout
        self.connection = None

    def connect(self) -> Tuple[bool, Optional[str]]:
        """Establish SSH connection to Cisco IOS device with full audit tracking."""
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
            },
        )
        try:
            from netmiko import ConnectHandler
            
            device_params = {
                "device_type": "cisco_ios",
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

            self.connection = ConnectHandler(**device_params)
            
            # If secret is set, enter enable mode if not already in privilege exec
            if self.secret and not self.connection.check_enable_mode():
                self.connection.enable()
                
            audit.log(
                event_type="SSH_CONNECT_SUCCESS",
                severity="INFO",
                device_ip=self.host,
                details={"port": self.port, "user": self.username},
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
