#!/usr/bin/env python3
"""
FTD & ASA Network Perimeter Operations Client
High-reliability Netmiko client for Cisco Firepower Threat Defense (FTD) and ASA.

Capabilities:
- Live fleet-wide parallel execution via ThreadPoolExecutor.
- Safe diagnostic-cli / Lina elevation handling for Cisco FTD.
- Built-in dry-run safety modes to prevent accidental mutations in production.
- Structured JSON output for Node.js / Next.js API consumption.
"""

import sys
import os
import re
import json
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Any, Optional

# Ensure standard output can handle UTF-8 on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Attempt Netmiko import
try:
    from netmiko import ConnectHandler
    from netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException
except ImportError:
    print(json.dumps({"error": "Netmiko is not installed in the active Python environment. Run 'pip install netmiko'."}))
    sys.exit(1)


def load_env_file():
    """Lightweight .env file parser to avoid external dependencies like python-dotenv."""
    possible_paths = [
        os.path.join(os.getcwd(), ".env"),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
    ]
    for env_path in possible_paths:
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip()
                        # Strip surrounding single or double quotes
                        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                            val = val[1:-1]
                        if key not in os.environ:
                            os.environ[key] = val
                break
            except Exception as e:
                pass


def get_firewalls_config() -> List[Dict[str, Any]]:
    """Loads and validates firewall configurations from FIREWALL_CONFIG and S2S_FIREWALL_CONFIG."""
    load_env_file()
    configs = []
    seen_ids = set()

    for env_var in ["FIREWALL_CONFIG", "S2S_FIREWALL_CONFIG"]:
        raw = os.environ.get(env_var, "[]")
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                for fw in parsed:
                    fid = str(fw.get("id") or fw.get("ip") or "").lower()
                    if fid and fid not in seen_ids:
                        seen_ids.add(fid)
                        configs.append(fw)
        except Exception:
            pass
    return configs


class FtdClient:
    def __init__(self, fw_config: Dict[str, Any], timeout: int = 15, device_type: str = "cisco_ftd"):
        self.fw_id = fw_config.get("id", fw_config.get("ip", "unknown"))
        self.name = fw_config.get("name", self.fw_id)
        self.ip = fw_config.get("ip")
        self.user = fw_config.get("user")
        self.password = fw_config.get("pass")
        self.timeout = timeout
        self.device_type = device_type

    def _get_connection_params(self, dev_type: Optional[str] = None) -> Dict[str, Any]:
        return {
            "device_type": dev_type or self.device_type,
            "host": self.ip,
            "username": self.user,
            "password": self.password,
            "timeout": self.timeout,
            "session_timeout": self.timeout + 15,
            "fast_cli": False,
        }

    def _connect(self):
        """
        Connects via Netmiko. If using cisco_ftd, automatically elevates
        through 'system support diagnostic-cli' to access the Lina ASA engine.
        Falls back to cisco_asa if the prompt is already in native Lina mode.
        """
        if not self.ip or not self.user or not self.password:
            raise ValueError(f"Firewall '{self.name}' ({self.fw_id}) is missing IP or credentials in FIREWALL_CONFIG.")

        # Try designated device_type first
        try:
            conn = ConnectHandler(**self._get_connection_params(self.device_type))
            if self.device_type == "cisco_ftd":
                try:
                    # Netmiko enters diagnostic-cli and elevates to '#'
                    conn.enable()
                except Exception as enable_err:
                    # If enable fails, check if we're already at an enable prompt '#'
                    prompt = conn.find_prompt()
                    if not prompt.endswith("#"):
                        raise enable_err
            return conn
        except (NetmikoTimeoutException, NetmikoAuthenticationException):
            raise
        except Exception as e:
            # If cisco_ftd failed on initial prompt discovery, attempt fallback to cisco_asa
            # (common if TACACS logs directly into the ASA Lina prompt)
            if self.device_type == "cisco_ftd":
                try:
                    conn = ConnectHandler(**self._get_connection_params("cisco_asa"))
                    return conn
                except Exception:
                    pass
            raise e

    def test_version(self) -> Dict[str, Any]:
        """Safe read-only test: runs 'show version' to verify connectivity and prompt handling."""
        try:
            with self._connect() as conn:
                prompt = conn.find_prompt()
                output = conn.send_command("show version", read_timeout=15)
                # Extract first 5 lines for summary
                summary_lines = [line.strip() for line in output.splitlines() if line.strip()][:5]
                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "prompt": prompt,
                    "summary": " | ".join(summary_lines),
                    "output": output
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "error": str(e)
            }

    def check_shun(self, target_ip: str) -> Dict[str, Any]:
        """Checks if a specific IPv4 address is shunned on this firewall."""
        try:
            with self._connect() as conn:
                output = conn.send_command(f"show shun {target_ip}", read_timeout=15)
                is_shunned = target_ip in output and "shun" in output.lower()
                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "targetIp": target_ip,
                    "isShunned": is_shunned,
                    "output": output.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "targetIp": target_ip,
                "error": str(e)
            }

    def get_all_shuns(self) -> Dict[str, Any]:
        """Polls the full table of currently active shuns from the firewall."""
        try:
            with self._connect() as conn:
                output = conn.send_command("show shun", read_timeout=60)
                ip_regex = r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b"
                found_ips = set()
                for line in output.splitlines():
                    if any(k in line.lower() for k in ["shun", "src_ip", "cnt="]):
                        matches = re.findall(ip_regex, line)
                        for m in matches:
                            found_ips.add(m)

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "shunCount": len(found_ips),
                    "shunnedIps": sorted(list(found_ips)),
                    "rawOutput": output
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "error": str(e)
            }

    def remove_shun(self, target_ip: str, dry_run: bool = True) -> Dict[str, Any]:
        """Removes a shun for the given IP address ('no shun <target_ip>')."""
        if dry_run:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": True,
                "dryRun": True,
                "command": f"no shun {target_ip}",
                "message": f"[DRY-RUN] Simulated 'no shun {target_ip}' on {self.name} ({self.ip}). No changes applied."
            }

        try:
            with self._connect() as conn:
                output = conn.send_command(f"no shun {target_ip}", read_timeout=15)
                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "dryRun": False,
                    "command": f"no shun {target_ip}",
                    "output": output.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "dryRun": False,
                "command": f"no shun {target_ip}",
                "error": str(e)
            }

    def add_shun(self, target_ip: str, dry_run: bool = True) -> Dict[str, Any]:
        """Adds a shun for the given IP address ('shun <target_ip>')."""
        if dry_run:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": True,
                "dryRun": True,
                "command": f"shun {target_ip}",
                "message": f"[DRY-RUN] Simulated 'shun {target_ip}' on {self.name} ({self.ip}). No changes applied."
            }

        try:
            with self._connect() as conn:
                output = conn.send_command(f"shun {target_ip}", read_timeout=15)
                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "dryRun": False,
                    "command": f"shun {target_ip}",
                    "output": output.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "dryRun": False,
                "command": f"shun {target_ip}",
                "error": str(e)
            }

    def get_s2s_tunnels(self) -> Dict[str, Any]:
        """Polls LAN-to-LAN S2S VPN sessions, IKEv2 SAs, and IPsec summary from FTD/ASA."""
        try:
            with self._connect() as conn:
                l2l_out = conn.send_command("show vpn-sessiondb l2l", read_timeout=20)
                ikev2_out = conn.send_command("show crypto ikev2 sa", read_timeout=20)
                ipsec_out = conn.send_command("show crypto ipsec sa summary", read_timeout=20)

                tunnels = []
                # Parse L2L output blocks
                session_blocks = re.split(r"Session Type:\s*LAN-to-LAN", l2l_out)
                for blk in session_blocks[1:]:
                    conn_m = re.search(r"Connection\s*:\s*([^\r\n]+)", blk)
                    ip_m = re.search(r"IP Addr\s*:\s*([0-9\.]+)", blk)
                    proto_m = re.search(r"Protocol\s*:\s*([^\r\n]+)", blk)
                    encr_m = re.search(r"Encryption\s*:\s*([^\r\n]+)", blk)
                    hash_m = re.search(r"Hashing\s*:\s*([^\r\n]+)", blk)
                    tx_m = re.search(r"Bytes Tx\s*:\s*(\d+)", blk)
                    rx_m = re.search(r"Bytes Rx\s*:\s*(\d+)", blk)
                    login_m = re.search(r"Login Time\s*:\s*([^\r\n]+)", blk)
                    dur_m = re.search(r"Duration\s*:\s*([^\r\n]+)", blk)

                    peer_ip = ip_m.group(1).strip() if ip_m else (conn_m.group(1).strip() if conn_m else "unknown")
                    tunnels.append({
                        "peerIp": peer_ip,
                        "connection": conn_m.group(1).strip() if conn_m else peer_ip,
                        "protocol": proto_m.group(1).strip() if proto_m else "IKEv2 IPsec",
                        "encryption": encr_m.group(1).strip() if encr_m else "AES",
                        "hashing": hash_m.group(1).strip() if hash_m else "SHA",
                        "bytesTx": int(tx_m.group(1)) if tx_m else 0,
                        "bytesRx": int(rx_m.group(1)) if rx_m else 0,
                        "loginTime": login_m.group(1).strip() if login_m else "",
                        "duration": dur_m.group(1).strip() if dur_m else "",
                        "status": "UP"
                    })

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "tunnelCount": len(tunnels),
                    "tunnels": tunnels,
                    "rawL2l": l2l_out.strip(),
                    "rawIkev2": ikev2_out.strip(),
                    "rawIpsecSummary": ipsec_out.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "error": str(e)
            }

    def troubleshoot_tunnel(self, peer_ip: str) -> Dict[str, Any]:
        """Runs deep cryptographic diagnostics for a specific S2S VPN peer."""
        try:
            with self._connect() as conn:
                prompt = conn.find_prompt()
                is_standby = any(k in prompt.lower() for k in ["/standby", "(standby)", "-standby"])
                if is_standby:
                    return {
                        "firewallId": self.fw_id,
                        "firewallName": self.name,
                        "ip": self.ip,
                        "peerIp": peer_ip,
                        "success": True,
                        "isStandby": True,
                        "prompt": prompt,
                        "message": "Node is in Standby state; live crypto metrics executed on Active peer."
                    }

                ike_out = conn.send_command(f"show crypto ikev2 sa | include {peer_ip}", read_timeout=15)
                ipsec_out = conn.send_command(f"show crypto ipsec sa peer {peer_ip}", read_timeout=20)
                route_out = conn.send_command(f"show route {peer_ip}", read_timeout=15)

                encaps = 0
                decaps = 0
                send_err = 0
                recv_err = 0
                m_enc = re.search(r"#pkts encaps:\s*(\d+)", ipsec_out)
                if m_enc: encaps = int(m_enc.group(1))
                m_dec = re.search(r"#pkts decaps:\s*(\d+)", ipsec_out)
                if m_dec: decaps = int(m_dec.group(1))
                m_serr = re.search(r"#send errors:\s*(\d+)", ipsec_out)
                if m_serr: send_err = int(m_serr.group(1))
                m_rerr = re.search(r"#recv errors:\s*(\d+)", ipsec_out)
                if m_rerr: recv_err = int(m_rerr.group(1))

                loc_ident = ""
                rem_ident = ""
                m_loc = re.search(r"local ident \(addr/mask/prot/port\):\s*\(([^)]+)\)", ipsec_out)
                if m_loc: loc_ident = m_loc.group(1)
                m_rem = re.search(r"remote ident \(addr/mask/prot/port\):\s*\(([^)]+)\)", ipsec_out)
                if m_rem: rem_ident = m_rem.group(1)

                has_ipsec = "Crypto map tag:" in ipsec_out or "#pkts encaps:" in ipsec_out
                has_ike = "READY" in ike_out or peer_ip in ike_out

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "peerIp": peer_ip,
                    "success": True,
                    "isStandby": False,
                    "prompt": prompt,
                    "hasIke": has_ike,
                    "hasIpsec": has_ipsec,
                    "pktsEncaps": encaps,
                    "pktsDecaps": decaps,
                    "sendErrors": send_err,
                    "recvErrors": recv_err,
                    "localIdent": loc_ident,
                    "remoteIdent": rem_ident,
                    "ikeDetail": ike_out.strip(),
                    "ipsecDetail": ipsec_out.strip(),
                    "routeOutput": route_out.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "peerIp": peer_ip,
                "success": False,
                "error": str(e)
            }

    def bounce_tunnel(self, peer_ip: str, bounce_type: str = "ipsec", dry_run: bool = True) -> Dict[str, Any]:
        """Clears IKE or IPsec security associations for a peer to trigger re-negotiation."""
        cmd = f"clear crypto ipsec sa peer {peer_ip}" if bounce_type.lower() == "ipsec" else f"clear crypto ikev2 sa peer {peer_ip}"
        if dry_run:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "peerIp": peer_ip,
                "bounceType": bounce_type,
                "dryRun": True,
                "command": cmd,
                "success": True,
                "message": f"[DRY-RUN] Simulated '{cmd}' on {self.name} ({self.ip}). No changes applied."
            }
        try:
            with self._connect() as conn:
                # Check if prompt or node indicates standby
                try:
                    prompt = conn.find_prompt()
                    if "/standby" in prompt.lower() or "(standby)" in prompt.lower() or "-standby" in prompt.lower():
                        return {
                            "firewallId": self.fw_id,
                            "firewallName": self.name,
                            "ip": self.ip,
                            "peerIp": peer_ip,
                            "bounceType": bounce_type,
                            "dryRun": False,
                            "command": cmd,
                            "success": True,
                            "output": f"Standby unit ({prompt.strip()}): Crypto clear skipped on Standby node; active peer handles SA re-negotiation.",
                            "isStandby": True
                        }
                except Exception:
                    pass

                out = conn.send_command(cmd, read_timeout=20)
                if any(k in out.lower() for k in ["disabled on standby", "executed on the active", "standby unit"]):
                    return {
                        "firewallId": self.fw_id,
                        "firewallName": self.name,
                        "ip": self.ip,
                        "peerIp": peer_ip,
                        "bounceType": bounce_type,
                        "dryRun": False,
                        "command": cmd,
                        "success": True,
                        "output": f"Standby node acknowledged ({out.strip()}). Active peer handles re-negotiation.",
                        "isStandby": True
                    }

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "peerIp": peer_ip,
                    "bounceType": bounce_type,
                    "dryRun": False,
                    "command": cmd,
                    "success": True,
                    "output": out.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "peerIp": peer_ip,
                "bounceType": bounce_type,
                "dryRun": False,
                "command": cmd,
                "success": False,
                "error": str(e)
            }

    def get_ra_summary(self) -> Dict[str, Any]:
        """Polls live AnyConnect VPN session counts and system capacity from FTD/ASA."""
        try:
            with self._connect() as conn:
                output = conn.send_command("show vpn-sessiondb summary", cmd_verify=False, read_timeout=15)
                active_ac = 0
                cumulative_ac = 0
                peak_ac = 0
                device_capacity = 10000
                device_load = "0%"

                m_active = re.search(r"AnyConnect Client\s*:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)", output)
                if m_active:
                    active_ac = int(m_active.group(1))
                    cumulative_ac = int(m_active.group(2))
                    peak_ac = int(m_active.group(3))

                m_cap = re.search(r"Device Total VPN Capacity\s*:\s*(\d+)", output)
                if m_cap:
                    device_capacity = int(m_cap.group(1))

                m_load = re.search(r"Device Load\s*:\s*([^\r\n]+)", output)
                if m_load:
                    device_load = m_load.group(1).strip()

                # Detect HA Role (Active vs Standby)
                # Standby nodes have 'Total Standby' or 'Standby :' in the summary header
                is_standby = bool(
                    re.search(r"Total Standby", output, re.IGNORECASE) or 
                    re.search(r"^\s*Standby\s*:", output, re.MULTILINE)
                )
                ha_role = "STANDBY" if is_standby else "ACTIVE"

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "haRole": ha_role,
                    "activeAnyConnect": active_ac if ha_role == "ACTIVE" else 0,
                    "standbyAnyConnect": active_ac if ha_role == "STANDBY" else 0,
                    "reportedSessions": active_ac,
                    "cumulativeAnyConnect": cumulative_ac,
                    "peakAnyConnect": peak_ac,
                    "deviceCapacity": device_capacity,
                    "deviceLoad": device_load,
                    "rawSummary": output.strip()
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "error": str(e)
            }

    def get_ra_sessions(self, filter_type: Optional[str] = None, filter_val: Optional[str] = None) -> Dict[str, Any]:
        """Polls live AnyConnect active sessions, optionally filtered by username, assigned IP, or public IP."""
        cmd = "show vpn-sessiondb anyconnect"
        if filter_type and filter_val:
            cmd = f"show vpn-sessiondb anyconnect filter {filter_type} {filter_val}"

        try:
            with self._connect() as conn:
                output = conn.send_command(cmd, cmd_verify=False, read_timeout=25)
                sessions = []

                if "no active sessions" not in output.lower() and "there are presently no active sessions" not in output.lower():
                    # Split into session chunks
                    raw_blocks = re.split(r"(?:^|\n)(?=Username\s*:)", output)
                    for blk in raw_blocks:
                        if not blk.strip() or "Username" not in blk:
                            continue

                        u_match = re.search(r"Username\s*:\s*([^\s\r\n]+)", blk)
                        if not u_match:
                            continue
                        user = u_match.group(1).strip()

                        idx_match = re.search(r"Index\s*:\s*(\d+)", blk)
                        a_ip_match = re.search(r"Assigned IP\s*:\s*([0-9\.]+)", blk)
                        p_ip_match = re.search(r"Public IP\s*:\s*([0-9\.]+)", blk)
                        proto_match = re.search(r"Protocol\s*:\s*([^\r\n]+)", blk)
                        enc_match = re.search(r"Encryption\s*:\s*([^\r\n]+)", blk)
                        tx_match = re.search(r"Bytes Tx\s*:\s*(\d+)", blk)
                        rx_match = re.search(r"Bytes Rx\s*:\s*(\d+)", blk)
                        grp_match = re.search(r"Group Policy\s*:\s*([^\r\n]+)", blk)
                        tun_match = re.search(r"Tunnel Group\s*:\s*([^\r\n]+)", blk)
                        login_match = re.search(r"Login Time\s*:\s*([^\r\n]+)", blk)
                        dur_match = re.search(r"Duration\s*:\s*([^\r\n]+)", blk)
                        inact_match = re.search(r"Inactivity\s*:\s*([^\r\n]+)", blk)
                        audit_match = re.search(r"Audt Sess ID\s*:\s*([^\r\n]+)", blk)

                        sessions.append({
                            "username": user,
                            "index": idx_match.group(1) if idx_match else "",
                            "assignedIp": a_ip_match.group(1) if a_ip_match else "",
                            "publicIp": p_ip_match.group(1) if p_ip_match else "",
                            "protocol": proto_match.group(1).strip() if proto_match else "IKEv2 / IPsec",
                            "encryption": enc_match.group(1).strip() if enc_match else "AES-GCM-256",
                            "bytesTx": int(tx_match.group(1)) if tx_match else 0,
                            "bytesRx": int(rx_match.group(1)) if rx_match else 0,
                            "groupPolicy": grp_match.group(1).strip() if grp_match else "Standard",
                            "tunnelGroup": tun_match.group(1).strip() if tun_match else "DefaultWEBVPNGroup",
                            "loginTime": login_match.group(1).strip() if login_match else "",
                            "duration": dur_match.group(1).strip() if dur_match else "",
                            "inactivity": inact_match.group(1).strip() if inact_match else "",
                            "auditSessionId": audit_match.group(1).strip() if audit_match else "",
                            "firewallId": self.fw_id,
                            "firewallName": self.name,
                            "firewallIp": self.ip
                        })

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "command": cmd,
                    "sessionCount": len(sessions),
                    "sessions": sessions
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "error": str(e)
            }

    def get_ra_pools(self) -> Dict[str, Any]:
        """Polls AnyConnect local IP address pool configuration and real-time lease utilization."""
        try:
            with self._connect() as conn:
                conf_out = conn.send_command("show running-config ip local pool", cmd_verify=False, read_timeout=15)
                pools = []

                # Matches: ip local pool <name> <start-end> mask <mask>
                pool_matches = re.findall(r"ip local pool\s+([^\s]+)\s+([0-9\.]+)-([0-9\.]+)(?:\s+mask\s+([0-9\.]+))?", conf_out)
                for p_name, p_start, p_end, p_mask in pool_matches:
                    # Calculate total IP capacity
                    try:
                        import ipaddress
                        start_int = int(ipaddress.IPv4Address(p_start))
                        end_int = int(ipaddress.IPv4Address(p_end))
                        total_ips = max(1, end_int - start_int + 1)
                    except Exception:
                        total_ips = 254

                    # Now check usage for this pool
                    pool_detail_out = conn.send_command(f"show ip local pool {p_name}", cmd_verify=False, read_timeout=20)
                    in_use_ips = 0
                    if "In Use Addresses:" in pool_detail_out:
                        in_use_section = pool_detail_out.split("In Use Addresses:")[1]
                        in_use_lines = [l.strip() for l in in_use_section.splitlines() if re.match(r"^\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b", l.strip())]
                        in_use_ips = len(in_use_lines)

                    free_ips = max(0, total_ips - in_use_ips)
                    util_pct = round((in_use_ips / total_ips) * 100, 1) if total_ips > 0 else 0

                    pools.append({
                        "poolName": p_name,
                        "range": f"{p_start} - {p_end}",
                        "startIp": p_start,
                        "endIp": p_end,
                        "mask": p_mask or "255.255.255.0",
                        "totalIps": total_ips,
                        "usedIps": in_use_ips,
                        "freeIps": free_ips,
                        "utilizationPercent": util_pct,
                        "firewallId": self.fw_id,
                        "firewallName": self.name
                    })

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "success": True,
                    "pools": pools
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "success": False,
                "error": str(e)
            }

    def terminate_ra_session(self, target: str, session_type: str = "name", dry_run: bool = True) -> Dict[str, Any]:
        """Disconnects an active AnyConnect session via 'vpn-sessiondb logoff [name|ipaddress] <target>'."""
        cmd = f"vpn-sessiondb logoff {session_type} {target}"
        if dry_run:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "target": target,
                "sessionType": session_type,
                "dryRun": True,
                "command": cmd,
                "success": True,
                "message": f"[DRY-RUN] Simulated '{cmd}' on {self.name} ({self.ip}). No sessions dropped."
            }

        try:
            with self._connect() as conn:
                output = conn.send_command(cmd, cmd_verify=False, read_timeout=15)
                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "target": target,
                    "sessionType": session_type,
                    "dryRun": False,
                    "command": cmd,
                    "success": True,
                    "output": output.strip() or "Session logoff command sent to firewall."
                }
        except Exception as e:
            return {
                "firewallId": self.fw_id,
                "firewallName": self.name,
                "ip": self.ip,
                "target": target,
                "sessionType": session_type,
                "dryRun": False,
                "command": cmd,
                "success": False,
                "error": str(e)
            }



def run_fleet_operation(action: str, target_ip: Optional[str] = None, dry_run: bool = True, target_id: Optional[str] = None, bounce_type: str = "ipsec", username: Optional[str] = None, filter_type: Optional[str] = None, filter_val: Optional[str] = None, session_type: str = "name") -> List[Dict[str, Any]]:
    """Runs an action concurrently across all or a selected firewall."""
    firewalls = get_firewalls_config()
    if not firewalls:
        return [{"error": "No firewalls found in FIREWALL_CONFIG or S2S_FIREWALL_CONFIG."}]

    # Filter by target
    if target_id and target_id.lower() not in ["all", "fleet", "ra"]:
        tid = target_id.lower().strip()
        matched = [
            fw for fw in firewalls
            if str(fw.get("id", "")).lower() == tid
            or str(fw.get("ip", "")).lower() == tid
            or str(fw.get("name", "")).lower() == tid
            or tid in str(fw.get("id", "")).lower()
            or tid in str(fw.get("name", "")).lower()
        ]
        if not matched:
            return [{"error": f"Target firewall '{target_id}' was not found in FIREWALL_CONFIG or S2S_FIREWALL_CONFIG."}]
        firewalls = matched
    elif target_id and target_id.lower() == "ra":
        # Target only Remote Access firewalls (fw1-fw4 or names with connect/reconnect)
        ra_fws = [fw for fw in firewalls if any(k in str(fw.get("id", "")).lower() for k in ["fw1", "fw2", "fw3", "fw4"]) or "connect" in str(fw.get("name", "")).lower() or "reconnect" in str(fw.get("name", "")).lower()]
        if ra_fws:
            firewalls = ra_fws

    # If action is an RA action and no target was specified, default to RA firewalls
    if not target_id and action.startswith("ra_"):
        ra_fws = [fw for fw in firewalls if any(k in str(fw.get("id", "")).lower() for k in ["fw1", "fw2", "fw3", "fw4"]) or "connect" in str(fw.get("name", "")).lower() or "reconnect" in str(fw.get("name", "")).lower()]
        if ra_fws:
            firewalls = ra_fws

    results = []
    with ThreadPoolExecutor(max_workers=min(len(firewalls), 8)) as executor:
        future_map = {}
        for fw in firewalls:
            client = FtdClient(fw)
            if action == "version":
                f = executor.submit(client.test_version)
            elif action == "check":
                if not target_ip:
                    return [{"error": "--ip is required for 'check' action"}]
                f = executor.submit(client.check_shun, target_ip)
            elif action == "show_all":
                f = executor.submit(client.get_all_shuns)
            elif action == "unshun":
                if not target_ip:
                    return [{"error": "--ip is required for 'unshun' action"}]
                f = executor.submit(client.remove_shun, target_ip, dry_run=dry_run)
            elif action == "shun":
                if not target_ip:
                    return [{"error": "--ip is required for 'shun' action"}]
                f = executor.submit(client.add_shun, target_ip, dry_run=dry_run)
            elif action == "s2s_status":
                f = executor.submit(client.get_s2s_tunnels)
            elif action == "s2s_troubleshoot":
                if not target_ip:
                    return [{"error": "--ip (peer IP) is required for 's2s_troubleshoot' action"}]
                f = executor.submit(client.troubleshoot_tunnel, target_ip)
            elif action == "s2s_bounce":
                if not target_ip:
                    return [{"error": "--ip (peer IP) is required for 's2s_bounce' action"}]
                f = executor.submit(client.bounce_tunnel, target_ip, bounce_type=bounce_type, dry_run=dry_run)
            elif action == "ra_summary":
                f = executor.submit(client.get_ra_summary)
            elif action == "ra_sessions":
                f_type = filter_type or ("name" if username else ("a-ipaddress" if target_ip else None))
                f_val = filter_val or username or target_ip
                f = executor.submit(client.get_ra_sessions, filter_type=f_type, filter_val=f_val)
            elif action == "ra_pools":
                f = executor.submit(client.get_ra_pools)
            elif action == "ra_terminate":
                target = username or target_ip
                if not target:
                    return [{"error": "--username or --ip is required for 'ra_terminate' action"}]
                s_type = session_type if session_type else ("name" if username else "ipaddress")
                f = executor.submit(client.terminate_ra_session, target=target, session_type=s_type, dry_run=dry_run)
            else:
                return [{"error": f"Unknown action: {action}"}]
            future_map[f] = fw

        for future in as_completed(future_map):
            try:
                res = future.result()
                results.append(res)
            except Exception as exc:
                fw = future_map[future]
                results.append({
                    "firewallId": fw.get("id"),
                    "firewallName": fw.get("name"),
                    "ip": fw.get("ip"),
                    "success": False,
                    "error": str(exc)
                })

    return results


def main():
    parser = argparse.ArgumentParser(description="Netmiko Cisco FTD / ASA Operations Client")
    parser.add_argument("--list", action="store_true", help="List all configured firewalls without credentials")
    parser.add_argument("--target", default="fleet", help="Target firewall ID/Name or 'fleet' / 'ra' for all (default: fleet)")
    parser.add_argument("--action", choices=[
        "version", "check", "show_all", "unshun", "shun", 
        "s2s_status", "s2s_troubleshoot", "s2s_bounce",
        "ra_summary", "ra_sessions", "ra_pools", "ra_terminate"
    ], default="version", help="Action to execute (default: version)")
    parser.add_argument("--ip", help="Target IPv4 address")
    parser.add_argument("--username", help="Target username for Remote Access VPN operations")
    parser.add_argument("--filter-type", choices=["name", "a-ipaddress", "p-ipaddress", "tunnel-group"], help="Filter field for AnyConnect sessions")
    parser.add_argument("--filter-val", help="Filter value for AnyConnect sessions")
    parser.add_argument("--session-type", choices=["name", "ipaddress"], default="name", help="Session termination type (default: name)")
    parser.add_argument("--bounce-type", choices=["ipsec", "ike"], default="ipsec", help="Type of SA to bounce (default: ipsec)")
    parser.add_argument("--live", action="store_true", help="Execute live mutation (disables default safe dry-run mode)")
    parser.add_argument("--json", action="store_true", help="Emit output strictly as formatted JSON")

    args = parser.parse_args()

    if args.list:
        fws = get_firewalls_config()
        safe_list = [{"id": f.get("id"), "name": f.get("name"), "ip": f.get("ip")} for f in fws]
        if args.json:
            print(json.dumps({"firewalls": safe_list}, indent=2))
        else:
            print(f"\nConfigured Firewalls ({len(safe_list)}):")
            for f in safe_list:
                print(f"  • {f['name']} (ID: {f['id']}) - IP: {f['ip']}")
        return

    # Enforce safe dry-run by default unless --live is passed
    dry_run = not args.live

    results = run_fleet_operation(
        action=args.action,
        target_ip=args.ip,
        dry_run=dry_run,
        target_id=args.target,
        bounce_type=getattr(args, "bounce_type", "ipsec"),
        username=args.username,
        filter_type=args.filter_type,
        filter_val=args.filter_val,
        session_type=args.session_type
    )

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(f"\n=== FTD / ASA Operation Results: [{args.action.upper()}] ===")
        if args.action in ["shun", "unshun"]:
            mode_tag = "🔴 LIVE EXECUTION" if not dry_run else "🟢 DRY-RUN SAFE MODE"
            print(f"Mode: {mode_tag}")
        for r in results:
            status = "✅ SUCCESS" if r.get("success") else "❌ FAILED"
            print(f"\n[{status}] {r.get('firewallName', 'Unknown')} ({r.get('ip', 'No IP')}):")
            if not r.get("success"):
                print(f"   Error: {r.get('error')}")
            else:
                if "isShunned" in r:
                    shun_badge = "🔴 SHUNNED" if r['isShunned'] else "🟢 NOT SHUNNED"
                    print(f"   Status: {shun_badge}")
                    print(f"   Output: {r.get('output')}")
                elif "shunCount" in r:
                    print(f"   Active Shuns: {r['shunCount']} IPs")
                    if r['shunCount'] > 0:
                        sample = r['shunnedIps'][:10]
                        print(f"   Sample ({min(10, r['shunCount'])}/{r['shunCount']}): {', '.join(sample)}")
                elif "summary" in r:
                    print(f"   Prompt: {r.get('prompt')}")
                    print(f"   Version: {r.get('summary')}")
                elif "message" in r:
                    print(f"   {r.get('message')}")
                elif "output" in r:
                    print(f"   Output: {r.get('output')}")


if __name__ == "__main__":
    main()
