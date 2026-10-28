"""Security utility for obfuscating credentials, passwords, and secrets in logs and session traces."""

from __future__ import annotations
import re
from typing import Any, Dict, List, Optional, Sequence, Union

# Common regex patterns where passwords/credentials might appear in CLI/Telnet outputs, prompts, or exception buffers
SENSITIVE_PATTERNS = [
    # Telnet/SSH buffer prompt echoes: "Password: secret123", "password : abc"
    (re.compile(r"((?:password|passwd|pwd|secret)\s*[:=]\s*)(\S+)", re.IGNORECASE), r"\1[REDACTED]"),
    # Cisco type 7 / type 5 / type 8 / type 9 password hashes or secret definitions
    (re.compile(r"((?:enable\s+secret|password)\s+(?:\d+\s+)?)(\S+)", re.IGNORECASE), r"\1[REDACTED]"),
    # SNMP communities: "snmp-server community public RO"
    (re.compile(r"(snmp-server\s+community\s+)(\S+)", re.IGNORECASE), r"\1[REDACTED]"),
    # Radius / TACACS pre-shared keys
    (re.compile(r"((?:radius-server|tacacs-server|tacacs\s+server)\s+key\s+(?:\d+\s+)?)(\S+)", re.IGNORECASE), r"\1[REDACTED]"),
    # Netmiko buffer dump lines containing password echoes
    (re.compile(r"(Buffer:\s*.*?(?:Password|password):\s*)(\S+)", re.IGNORECASE | re.DOTALL), r"\1[REDACTED]"),
]


def mask_sensitive_data(
    text: str,
    secret_words: Optional[Sequence[Optional[str]]] = None
) -> str:
    """
    Masks passwords, secrets, and credential strings from text.
    First masks known literal secret words (e.g. crawler password, enable secret),
    then applies pattern-based redaction for session prompts and config statements.
    """
    if not text:
        return text

    sanitized = str(text)

    # 1. Mask known secret words literally
    if secret_words:
        for secret in secret_words:
            if secret and len(str(secret).strip()) >= 2:
                sanitized = sanitized.replace(str(secret), "[REDACTED_SECRET]")

    # 2. Mask pattern-based occurrences
    for pattern, replacement in SENSITIVE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    return sanitized


def sanitize_dict_or_list(
    data: Any,
    secret_words: Optional[Sequence[Optional[str]]] = None
) -> Any:
    """Recursively walks dictionaries, lists, and strings to sanitize sensitive credential values."""
    if isinstance(data, str):
        return mask_sensitive_data(data, secret_words=secret_words)
    elif isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(term in k_lower for term in ("password", "secret", "token", "auth_token", "private_key")):
                new_dict[k] = "[REDACTED]"
            else:
                new_dict[k] = sanitize_dict_or_list(v, secret_words=secret_words)
        return new_dict
    elif isinstance(data, list):
        return [sanitize_dict_or_list(item, secret_words=secret_words) for item in data]
    elif isinstance(data, tuple):
        return tuple(sanitize_dict_or_list(item, secret_words=secret_words) for item in data)
    return data
