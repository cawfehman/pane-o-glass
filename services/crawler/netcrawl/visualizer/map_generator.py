"""Network map visualizer generating interactive HTML (Vis.js) and static SVG maps."""

from __future__ import annotations
import html
import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from netcrawl.models import Device, DeviceRole, DeviceStatus, PathHop
from netcrawl.topology.analyzer import TopologyAnalyzer

logger = logging.getLogger(__name__)

COLOR_MAP = {
    DeviceRole.ROUTER.value: "#00b4d8",       # Bright Cyan
    DeviceRole.L3_SWITCH.value: "#0077b6",    # Sapphire Blue
    DeviceRole.L2_SWITCH.value: "#2ec4b6",    # Emerald Teal
    DeviceRole.UNKNOWN.value: "#90e0ef",      # Light Blue
    "UNREACHABLE": "#e63946",                 # Bright Crimson Alert
}


class NetworkMapVisualizer:
    """Generates standalone interactive Vis.js HTML and vector SVG network maps."""

    def __init__(self, analyzer: TopologyAnalyzer, maps_dir: str = "maps"):
        self.analyzer = analyzer
        self.maps_dir = Path(maps_dir)
        self.maps_dir.mkdir(parents=True, exist_ok=True)

    def generate_html_map(
        self,
        output_path: Optional[Path] = None,
        snapshot_id: Optional[int] = None,
        highlight_hops: Optional[List[PathHop]] = None,
    ) -> Path:
        """Generate a rich, standalone interactive HTML network map using Vis.js."""
        if not output_path:
            snap_str = f"snapshot_{snapshot_id}" if snapshot_id else "latest"
            output_path = self.maps_dir / f"network_map_{snap_str}.html"

        # Build highlighted node & edge sets
        hl_nodes = set()
        hl_edges = set()
        if highlight_hops:
            for i, hop in enumerate(highlight_hops):
                hl_nodes.add(hop.device_name.lower())
                if i < len(highlight_hops) - 1:
                    next_hop = highlight_hops[i + 1]
                    hl_edges.add((hop.device_name.lower(), next_hop.device_name.lower()))
                    hl_edges.add((next_hop.device_name.lower(), hop.device_name.lower()))

        nodes = []
        for dev in self.analyzer.devices:
            is_unreachable = dev.status != DeviceStatus.REACHABLE
            is_path = dev.hostname.lower() in hl_nodes

            # Color determination
            if is_path:
                color = "#ffb703" # Vivid Amber / Gold for active path
            elif is_unreachable:
                color = COLOR_MAP["UNREACHABLE"]
            else:
                color = COLOR_MAP.get(dev.role.value, "#48cae4")

            # Label & Title (rich tooltip)
            status_text = f"🚨 {dev.status.value}" if is_unreachable else "✅ ONLINE"
            tooltip = f"""
            <b>{dev.hostname}</b> ({dev.ip_address})<br>
            <b>Role:</b> {dev.role.value} | <b>Status:</b> {status_text}<br>
            <b>Platform:</b> {dev.platform or 'N/A'}<br>
            <b>Interfaces:</b> {len(dev.interfaces)} | <b>Routes:</b> {len(dev.routes)}<br>
            """
            if is_unreachable:
                tooltip += f"<b style='color:#e63946;'>Failure Reason:</b> {html.escape(dev.failure_reason or 'Unknown')}<br>"
                tooltip += f"<b>Discovered via:</b> {html.escape(dev.discovered_via or 'N/A')}<br>"

            shape = "hexagon" if dev.role == DeviceRole.ROUTER else ("box" if dev.role == DeviceRole.L3_SWITCH else "ellipse")
            if is_unreachable:
                shape = "box"

            nodes.append({
                "id": dev.hostname,
                "label": f"{dev.hostname}\n({dev.ip_address})",
                "color": {
                    "background": color,
                    "border": "#ffffff" if is_path else ("#ff0033" if is_unreachable else "#1d3557"),
                    "highlight": {"background": "#ffdd00", "border": "#ffffff"}
                },
                "shape": shape,
                "font": {"color": "#ffffff", "face": "Segoe UI, Arial", "size": 13, "bold": True},
                "title": tooltip,
                "borderWidth": 4 if (is_path or is_unreachable) else 2,
                "shadow": True,
                "role": dev.role.value,
                "status": dev.status.value,
                "ip": dev.ip_address,
                "platform": dev.platform or "N/A",
                "failure_reason": dev.failure_reason,
                "discovered_via": dev.discovered_via,
            })

        edges = []
        for link in self.analyzer.links:
            edge_key = (link.source_device.lower(), link.target_device.lower())
            is_path_edge = edge_key in hl_edges

            color = "#ffb703" if is_path_edge else ("#e63946" if link.status != "UP" else "#457b9d")
            width = 4 if is_path_edge else 2
            dashes = True if link.link_type == "L2_TRUNK" or link.status != "UP" else False

            edge_label = f"{link.source_interface} ↔ {link.target_interface}"
            if link.speed:
                edge_label += f"\n({link.speed})"

            edges.append({
                "from": link.source_device,
                "to": link.target_device,
                "label": edge_label,
                "font": {"color": "#a8dadc", "size": 10, "align": "middle", "strokeWidth": 0},
                "color": {"color": color, "highlight": "#ffdd00"},
                "width": width,
                "dashes": dashes,
                "smooth": {"type": "continuous"},
                "title": f"Link: {link.source_device}:{link.source_interface} ↔ {link.target_device}:{link.target_interface}<br>Type: {link.link_type} | Speed: {link.speed or 'N/A'}",
            })

        html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Network Topology Map - NetCrawl</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }}
        header {{
            background: #1e293b;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #334155;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
        }}
        .logo-title {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .logo {{
            width: 32px;
            height: 32px;
            background: #00b4d8;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: #0f172a;
        }}
        h1 {{ font-size: 18px; font-weight: 600; color: #f8fafc; }}
        .badge {{
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 500;
        }}
        .badge-info {{ background: #0369a1; color: #e0f2fe; }}
        .badge-danger {{ background: #991b1b; color: #fee2e2; }}
        .controls {{
            display: flex;
            gap: 12px;
            align-items: center;
        }}
        button {{
            background: #334155;
            border: 1px solid #475569;
            color: #f8fafc;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }}
        button:hover {{ background: #475569; }}
        #container {{
            flex: 1;
            position: relative;
            background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
        }}
        #network {{
            width: 100%;
            height: 100%;
        }}
        .legend {{
            position: absolute;
            bottom: 20px;
            left: 20px;
            background: rgba(30, 41, 59, 0.92);
            backdrop-filter: blur(8px);
            padding: 14px 18px;
            border-radius: 10px;
            border: 1px solid #334155;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
            font-size: 12px;
            z-index: 10;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }}
        .legend-item:last-child {{ margin-bottom: 0; }}
        .color-dot {{
            width: 14px;
            height: 14px;
            border-radius: 3px;
        }}
        #sidebar {{
            position: absolute;
            top: 20px;
            right: 20px;
            width: 340px;
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid #334155;
            border-radius: 10px;
            padding: 20px;
            display: none;
            z-index: 10;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            max-height: 85vh;
            overflow-y: auto;
        }}
        .sidebar-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #334155;
            padding-bottom: 10px;
            margin-bottom: 14px;
        }}
        .close-btn {{
            cursor: pointer;
            color: #94a3b8;
            font-size: 18px;
        }}
        .close-btn:hover {{ color: #f8fafc; }}
        .meta-row {{
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid #1e293b;
            font-size: 13px;
        }}
        .meta-label {{ color: #94a3b8; }}
        .meta-value {{ font-weight: 500; text-align: right; }}
    </style>
</head>
<body>
    <header>
        <div class="logo-title">
            <div class="logo">⚡</div>
            <h1>NetCrawl Topology Snapshot</h1>
            <span class="badge badge-info">{len(self.analyzer.devices)} Devices ({len(self.analyzer.links)} Links)</span>
            {'<span class="badge badge-danger">🚨 ' + str(len([d for d in self.analyzer.devices if d.status != DeviceStatus.REACHABLE])) + ' Unreachable</span>' if any(d.status != DeviceStatus.REACHABLE for d in self.analyzer.devices) else ''}
        </div>
        <div class="controls">
            <button onclick="network.fit({{animation: true}})">Fit Screen</button>
            <button onclick="togglePhysics()">Toggle Physics</button>
            <button onclick="window.print()">Print / Export</button>
        </div>
    </header>
    <div id="container">
        <div id="network"></div>
        <div class="legend">
            <div style="font-weight: 600; margin-bottom: 8px; color: #e2e8f0;">Legend</div>
            <div class="legend-item"><div class="color-dot" style="background:#00b4d8;"></div>Router</div>
            <div class="legend-item"><div class="color-dot" style="background:#0077b6;"></div>L3 Core/Dist Switch</div>
            <div class="legend-item"><div class="color-dot" style="background:#2ec4b6;"></div>L2 Access Switch</div>
            <div class="legend-item"><div class="color-dot" style="background:#e63946;"></div>🚨 Unreachable (Investigate)</div>
            <div class="legend-item"><div class="color-dot" style="background:#ffb703;"></div>Active Path Hop</div>
        </div>
        <div id="sidebar">
            <div class="sidebar-header">
                <h2 id="side-title" style="font-size: 16px;">Device Details</h2>
                <span class="close-btn" onclick="document.getElementById('sidebar').style.display='none'">✕</span>
            </div>
            <div id="side-content"></div>
        </div>
    </div>

    <script type="text/javascript">
        const rawNodes = {json.dumps(nodes)};
        const rawEdges = {json.dumps(edges)};

        const container = document.getElementById('network');
        const data = {{
            nodes: new vis.DataSet(rawNodes),
            edges: new vis.DataSet(rawEdges)
        }};
        
        let physicsEnabled = true;
        const options = {{
            nodes: {{
                borderWidth: 2,
                size: 26,
                font: {{ color: '#f8fafc', size: 13 }}
            }},
            edges: {{
                arrows: {{ to: {{ enabled: false }} }},
                smooth: {{ type: 'cubicBezier', forceDirection: 'none', roundness: 0.2 }}
            }},
            physics: {{
                stabilization: true,
                barnesHut: {{
                    gravitationalConstant: -3500,
                    springConstant: 0.04,
                    springLength: 160
                }}
            }},
            interaction: {{
                hover: true,
                navigationButtons: true,
                keyboard: true
            }}
        }};

        const network = new vis.Network(container, data, options);

        function togglePhysics() {{
            physicsEnabled = !physicsEnabled;
            network.setOptions({{ physics: {{ enabled: physicsEnabled }} }});
        }}

        network.on("click", function (params) {{
            if (params.nodes.length > 0) {{
                const nodeId = params.nodes[0];
                const nodeData = rawNodes.find(n => n.id === nodeId);
                if (nodeData) {{
                    document.getElementById('side-title').innerText = nodeData.id;
                    let html = `
                        <div class="meta-row"><span class="meta-label">IP Address</span><span class="meta-value">${{nodeData.ip}}</span></div>
                        <div class="meta-row"><span class="meta-label">Role</span><span class="meta-value">${{nodeData.role}}</span></div>
                        <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value" style="color: ${{nodeData.status === 'REACHABLE' ? '#2ec4b6' : '#e63946'}}">${{nodeData.status}}</span></div>
                        <div class="meta-row"><span class="meta-label">Platform</span><span class="meta-value">${{nodeData.platform}}</span></div>
                    `;
                    if (nodeData.failure_reason) {{
                        html += `<div style="margin-top:12px; padding:10px; background:#450a0a; border-radius:6px; border:1px solid #ef4444; color:#fca5a5; font-size:12px;">
                            <b>🚨 FAILURE DIAGNOSTIC:</b><br>${{nodeData.failure_reason}}
                        </div>`;
                    }}
                    if (nodeData.discovered_via) {{
                        html += `<div class="meta-row" style="margin-top:8px;"><span class="meta-label">Discovered Via</span><span class="meta-value">${{nodeData.discovered_via}}</span></div>`;
                    }}
                    document.getElementById('side-content').innerHTML = html;
                    document.getElementById('sidebar').style.display = 'block';
                }}
            }}
        }});
    </script>
</body>
</html>
"""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_template)

        logger.info(f"Generated interactive network map: {output_path}")
        return output_path

    def generate_svg_map(self, output_path: Optional[Path] = None, snapshot_id: Optional[int] = None) -> Path:
        """Generate a static vector SVG diagram."""
        if not output_path:
            snap_str = f"snapshot_{snapshot_id}" if snapshot_id else "latest"
            output_path = self.maps_dir / f"network_map_{snap_str}.svg"

        devices = self.analyzer.devices
        num_devices = len(devices)
        if num_devices == 0:
            svg_content = '<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg"><text x="50" y="100" fill="#fff">No devices</text></svg>'
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(svg_content)
            return output_path

        # Layout nodes in circular / hierarchical arrangement
        width, height = 1200, 800
        cx, cy = width / 2, height / 2
        radius = min(width, height) * 0.38

        node_positions: Dict[str, Tuple[float, float]] = {}
        for i, dev in enumerate(devices):
            angle = 2 * math.pi * i / num_devices
            nx = cx + radius * math.cos(angle)
            ny = cy + radius * math.sin(angle)
            node_positions[dev.hostname] = (nx, ny)

        svg_lines = [
            f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">',
            '<rect width="100%" height="100%" fill="#0f172a"/>',
            '<defs>',
            '  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">',
            '    <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/>',
            '  </filter>',
            '</defs>',
        ]

        # Draw Links
        for link in self.analyzer.links:
            pos_src = node_positions.get(link.source_device)
            pos_dst = node_positions.get(link.target_device)
            if pos_src and pos_dst:
                x1, y1 = pos_src
                x2, y2 = pos_dst
                color = "#ef4444" if link.status != "UP" else "#38bdf8"
                dash = 'stroke-dasharray="6,4"' if link.link_type == "L2_TRUNK" or link.status != "UP" else ""
                svg_lines.append(f'  <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="2.5" {dash} opacity="0.8"/>')

        # Draw Nodes
        for dev in devices:
            pos = node_positions.get(dev.hostname)
            if not pos:
                continue
            x, y = pos
            is_unreach = dev.status != DeviceStatus.REACHABLE
            color = "#ef4444" if is_unreach else COLOR_MAP.get(dev.role.value, "#0284c7")
            border = "#fee2e2" if is_unreach else "#ffffff"

            svg_lines.append(f'  <g transform="translate({x:.1f},{y:.1f})" filter="url(#shadow)">')
            svg_lines.append(f'    <rect x="-70" y="-30" width="140" height="60" rx="8" fill="{color}" stroke="{border}" stroke-width="2"/>')
            svg_lines.append(f'    <text x="0" y="-8" fill="#ffffff" font-family="Segoe UI, Arial" font-size="12" font-weight="bold" text-anchor="middle">{html.escape(dev.hostname)}</text>')
            svg_lines.append(f'    <text x="0" y="12" fill="#e2e8f0" font-family="Segoe UI, Arial" font-size="10" text-anchor="middle">{dev.ip_address}</text>')
            if is_unreach:
                svg_lines.append('    <text x="0" y="24" fill="#fee2e2" font-family="Segoe UI, Arial" font-size="9" font-weight="bold" text-anchor="middle">🚨 UNREACHABLE</text>')
            svg_lines.append('  </g>')

        svg_lines.append('</svg>')

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(svg_lines))

        logger.info(f"Generated static vector network map: {output_path}")
        return output_path
