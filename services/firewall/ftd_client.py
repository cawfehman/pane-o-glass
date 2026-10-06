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
                ike_detail = conn.send_command(f"show crypto ikev2 sa detail", read_timeout=25)
                ipsec_detail = conn.send_command(f"show crypto ipsec sa peer {peer_ip} detail", read_timeout=25)
                route_out = conn.send_command(f"show route {peer_ip}", read_timeout=15)

                return {
                    "firewallId": self.fw_id,
                    "firewallName": self.name,
                    "ip": self.ip,
                    "peerIp": peer_ip,
                    "success": True,
                    "ikeDetail": ike_detail.strip(),
                    "ipsecDetail": ipsec_detail.strip(),
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
                out = conn.send_command(cmd, read_timeout=20)
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



def run_fleet_operation(action: str, target_ip: Optional[str] = None, dry_run: bool = True, target_id: Optional[str] = None, bounce_type: str = "ipsec") -> List[Dict[str, Any]]:
    """Runs an action concurrently across all or a selected firewall."""
    firewalls = get_firewalls_config()
    if not firewalls:
        return [{"error": "No firewalls found in FIREWALL_CONFIG or S2S_FIREWALL_CONFIG."}]

    if target_id and target_id.lower() not in ["all", "fleet"]:
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
    parser.add_argument("--target", default="fleet", help="Target firewall ID/Name or 'fleet' for all (default: fleet)")
    parser.add_argument("--action", choices=["version", "check", "show_all", "unshun", "shun", "s2s_status", "s2s_troubleshoot", "s2s_bounce"], default="version",
                        help="Action to execute (default: version)")
    parser.add_argument("--ip", help="Target IPv4 address (required for check, shun, unshun, s2s_troubleshoot, s2s_bounce)")
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
        bounce_type=getattr(args, "bounce_type", "ipsec")
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
