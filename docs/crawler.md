# Cisco Network Crawler & Topology Visualizer

The **Cisco Network Crawler & Path Tracer** is an automated, strictly read-only network discovery and simulation platform built into Pane-o-Glass. It crawls multi-tier enterprise switch topologies via SSH, correlates physical and logical interconnections, identifies routing and switching tiers, groups devices into hierarchical site and closet containers, and simulates packet forwarding hop-by-hop.

---

## 1. System Architecture

The crawler utilizes a hybrid architecture optimized for both interactive web visualization and high-throughput concurrent discovery:

```
┌────────────────────────────────────────────────────────┐
│                   Next.js Web UI                      │
│   (/admin/crawler • TopologyGraph • DeviceInspector)   │
└─────────────────────────┬──────────────────────────────┘
                          │ 1. Launch Crawl (SSE Stream)
                          ▼
┌────────────────────────────────────────────────────────┐
│              Python Crawl Engine (Subprocess)          │
│  - Multi-threaded Netmiko SSH Workers (10–50 workers)  │
│  - Recursive BFS CDP / LLDP Neighbor Spidering         │
│  - Strict Read-Only Command Filtering Guard            │
│  - In-Memory Asynchronous Queue Logger                 │
└─────────────────────────┬──────────────────────────────┘
                          │ 2. Structured JSON Snapshot
                          ▼
┌────────────────────────────────────────────────────────┐
│                 PostgreSQL Database                    │
│  - CrawlSnapshot (Metadata, Duration, Profile, Hops)   │
│  - CrawlDevice (Interfaces, Routes, VLANs, ARP, Stacks)│
│  - CrawlLink (Port Channels, Physical Links, Status)   │
└────────────────────────────────────────────────────────┘
```

* **Frontend**: Next.js React client with SVG vector graphing, panning/zooming, collapsible container enclosures, and deep device inspection sheets.
* **Worker Engine**: Isolated Python worker executing recursive breadth-first search (BFS) over SSH using Netmiko.
* **Storage**: Persistent PostgreSQL relational database managed via Prisma ORM (`CrawlSnapshot`, `CrawlDevice`, `CrawlLink`).

---

## 2. Strict Read-Only Security Guard

The crawler is designed to be completely non-destructive and safe for production environments:

* **No Configuration Mode**: The worker never executes `configure terminal`, `write memory`, `reload`, `erase`, or any state-modifying syntax.
* **Command Whitelist**: All executed commands are strictly whitelisted to read-only `show` and terminal formatting commands:
  * `terminal length 0`
  * `terminal width 512`
  * `show version`
  * `show cdp neighbors detail`
  * `show lldp neighbors detail`
  * `show ip interface brief`
  * `show interfaces status`
  * `show interfaces trunk`
  * `show ip route`
  * `show vlan brief`
  * `show ip arp`
* **Pre-Execution Validation**: If any non-whitelisted or configuration-altering command is detected, an exception (`ConfigModeForbiddenError`) is thrown immediately before socket transmission, aborting the command and recording a security alert.

---

## 3. Crawl Execution Profiles & Scope

When launching a crawl via the **Run Crawl** modal, administrators can select from three execution profiles:

| Profile | Command Set | Typical Speed | Best Used For |
| :--- | :--- | :--- | :--- |
| **Discovery** | `show version`, `show cdp neighbors detail` | ~1s per device | Fast credential audits, node reachability checks, and immediate neighbor inventory. |
| **Mapping** | Discovery + `show interfaces status`, `show interfaces trunk`, `show vlan brief` | ~3s per device | Complete physical and logical topology mapping, Port Channel correlation, and VLAN audits. |
| **Intensive** | Mapping + `show ip route`, `show ip arp` | ~8s per device | Full IPv4 routing table extraction (LPM) and ARP caches for hop-by-hop packet path simulation. |

### Hop Limits & Frontier Boundaries
* **Seed Switches**: One or more starting IP addresses (e.g. `10.100.1.1`).
* **Max Hop Depth (1–10 Hops)**: Restricts the recursive traversal depth from the initial seeds.
  * **Hop 1**: Seed switches and directly connected distribution/core neighbors.
  * **Hop 2**: Expands into IDF access closets and local building stacks.
  * **Hop 3+**: Expands outward across campus backbones and WAN aggregation links.
* **Boundary Nodes**: Switches detected via CDP/LLDP that sit exactly at the `max_hops` limit are preserved as **Unverified Frontier Boundary Nodes**. They are rendered on the diagram with a dashed amber border, and clicking on them provides a 1-click **Reseed Crawl** option.

---

## 4. Hierarchy & Container Conventions

The crawler parses enterprise device hostnames following standard conventions:

```
   101 - id1 - swas - 1
   ───   ───   ────   ─
    │     │     │     └─ Iterator / Chassis ID
    │     │     └─────── Role Code (e.g., cr01=Core, swds=Distribution, swas=Access)
    │     └───────────── IDF Closet / Location (e.g., mdf, id1, id2, 2mc)
    └─────────────────── Site Code (first 3 characters, e.g., 101, 202, HSP)
```

### Visual Enclosures & Layout
* **Site Enclosures**: Outer rounded containers grouping all devices sharing the same 3-character site prefix. Cross-referenced with the central Site Directory (`/settings/sites`) to display facility names when available.
* **IDF Closets**: Nested boxes inside each site grouping switches located within the same wiring closet (e.g., `IDF: ID1` or `IDF: MDF`).
* **In-Closet Traffic Flow**: Within each closet, Layer 3 distribution/core switches are positioned at the top row, with Layer 2 access switch stacks arranged neatly beneath them to reflect physical and logical uplinks.
* **Collapsible Containers**: Clicking the `[-]` icon on any site header collapses the entire facility into a compact summary card (`SITE: 101 • 14 Switches`). The **Collapse All** button in the control bar allows viewing large enterprise networks on a single screen.

---

## 5. Visual Topology & Color Legend

| Visual Element | Classification | Meaning & Behavior |
| :--- | :--- | :--- |
| **Cyan Strip** (`#0284c7`) | **Layer 3 Switch / Router** | Routed device participating in IP routing protocols, SVIs, or core aggregation. Marked with an `[L3]` badge. |
| **Emerald Strip** (`#10b981`) | **Layer 2 Switch** | Switched access closet device or edge stack providing end-user and endpoint port capacity. Marked with an `[L2]` badge. |
| **Purple Chip** (`#a855f7`) | **Cisco StackWise Stack** | Multi-chassis switch stack (e.g., 4x Catalyst 9300). Marked with a `[4x STK]` badge and filtered by member switch in the drawer. |
| **Amber Dashed** (`#f59e0b`) | **Unverified Boundary** | Switch discovered at the configured hop limit boundary. Not SSH-crawled, but mapped with a 1-click **Reseed** button. |
| **Red Card** (`#ef4444`) | **Unreachable / Flagged** | Switch failed SSH connection (authentication failure, timeout, or connection refused). Flagged in the Failure Investigation tab. |
| **Cyan Multi-Lane Edge** | **Port Channel / LAG** | Parallel physical links bundled into an EtherChannel. Displays bundle count (e.g. `[Po1 (2x)]`) with link popovers. |
| **Green Dot** (`#22c55e`) | **Verified Status** | Displays last successful crawl verification date & time (e.g. `● Verified: Sep 22, 17:45`). |

---

## 6. Cisco StackWise Recognition

Modern access switches frequently operate as multi-chassis stacks with up to 8 members and hundreds of ports:

* **Automatic Detection**: Evaluates interface numbering (e.g. `GigabitEthernet1/0/x`, `GigabitEthernet2/0/x`, `GigabitEthernet4/0/x`).
* **Summary Badging**: Displays total member switch count (e.g., `[4x STK]`) and total monitored port count.
* **Inspector Member Filtering**: In the **Device Inspector Drawer**, switches with stacks feature member tabs (`All`, `Switch 1`, `Switch 2`, etc.), allowing administrators to view interfaces per chassis without scrolling through hundreds of ports.

---

## 7. Device Inspector Drawer

Clicking on any switch in the topology opens the slide-out inspector drawer, providing:

* **Overview Tab**: IP address, serial number, software version, hardware platform, hop distance, and exact last verification timestamp.
* **Interfaces Tab**: Port speeds, duplex, admin/operational status, trunk mode, access VLAN, allowed VLAN list, and connected CDP/LLDP neighbors.
* **Routing Table Tab**: Active IPv4 routes, destination subnets, routing protocols (`C`, `S`, `O`, `B`), next-hops, and administrative distance.
* **VLAN Database Tab**: Active VLAN numbers and assigned interface membership lists.
* **CDP / LLDP Peers**: Adjacent neighbor hostnames, remote ports, platforms, and management IP addresses.
* **Audit & Forensics Tab**: Exact authentication duration in milliseconds, credentials used, and archived raw Cisco IOS command outputs.

---

## 8. Hop-by-Hop IPv4 Path Tracer

The **Path Tracer** simulates packet forwarding between two endpoints on any historical snapshot:

1. **Source & Destination**: Enter any source IP (e.g. `10.10.10.50`) and destination IP (e.g. `10.20.50.88`).
2. **Longest Prefix Match (LPM)**: The engine searches the routing table of the ingress gateway to locate the most specific matching route.
3. **Forwarding Resolution**:
   * Resolves the egress interface and next-hop IP.
   * If transitioning across Layer 2 access infrastructure, traces 802.1Q trunk connections between access and distribution switches.
   * Resolves final destination hosts on access ports using local ARP tables.
4. **Interactive Path Highlighting**: Successfully simulated routes highlight each participating switch and link in glowing blue directly on the topology diagram.

---

## 9. Credential Management & Failover

The crawler supports flexible, secure SSH authentication:

* **Server Default (`.env`)**: Uses centralized service credentials stored securely on the server.
* **Interactive Ephemeral Prompt**: Allows entering custom credentials in the modal for a specific crawl session.
  * **Primary Profile**: Standard domain or TACACS+ administrative credentials.
  * **Fallback Profiles**: Sequential fallback accounts (e.g., emergency local admin credentials) that are only tested if the primary account fails authentication.
  * **Security**: All custom credentials entered via the modal are kept strictly in memory for the duration of the crawl and are **never saved to disk or database**.

---

## 10. Standalone CLI Usage (Offline Mode)

For network engineers operating directly on a Linux or Windows terminal without web access, the crawler can be run as a standalone utility:

```bash
# Navigate to crawler directory
cd services/crawler

# 1. Run a virtual simulation crawl (safe offline test)
python main.py crawl --mock

# 2. Run a live production crawl with 20 workers up to 2 hops
python main.py crawl --seeds 10.100.1.1 --workers 20 --max-hops 2 --profile mapping

# 3. Simulate a packet path
python main.py trace --src 10.10.10.50 --dst 10.20.50.88

# 4. Compare two crawl snapshots to detect configuration drift
python main.py diff --snap1 1 --snap2 2
```
