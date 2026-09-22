# NetCrawl: Cisco IOS Network Crawler, Topology Analyzer & Path Tracer

A high-performance, strictly read-only network automation system designed to crawl Cisco IOS infrastructure (L2/L3 switches and routers) via SSH, correlate physical and logical topologies, store historical snapshots, generate interactive network diagrams, and simulate hop-by-hop packet forwarding.

---

## Key Features

1. **Concurrent BFS Spidering with CDP Filtering**:
   - Spiders across network infrastructure starting from one or more seed IP addresses.
   - Automatically filters out **Wireless Access Points** (`AIR-...`, `C9100...`, `Wlan AP`, `Trans-Bridge`) and IP phones from SSH crawling.
   - Extracts and structures routes, VLANs, SVIs, IP interfaces, trunk details, CDP links, and ARP tables.

2. **Strict Read-Only Enforcement (Never Enters Config Mode)**:
   - Programmatically guarantees zero state modification.
   - Hardcoded whitelist filter enforces that only read-only `show` and terminal formatting commands (`terminal length 0`, `terminal width 512`) are permitted.
   - Blocks commands like `conf t`, `configure terminal`, `write`, `erase`, `reload`, `no`, `shutdown`, `set` with an immediate exception before socket transmission.

3. **`aaa-bbb-cccc-d` Site & Hierarchy Parsing**:
   - Parses hostnames following the enterprise naming convention:
     - `aaa`: 3-digit site code (e.g. `101`, `202`)
     - `bbb`: 3-char IDF location (e.g. `mdf`, `id1`, `id2`)
     - `cccc`: Device role (e.g. `cr01`, `swds`, `swas`)
     - `d`: Device iterator
   - Automatically groups devices by Site and IDF across the database, CLI, and Web UI.

4. **Failure Investigation Center**:
   - Devices discovered via CDP that fail SSH connections (timeouts, auth failures, connection refused) are flagged in red.
   - Records the exact failure reason and the discovering neighbor switch and port (e.g., *Discovered from `101-mdf-swds-1` on port `Gi1/0/4`*).

5. **Hop-by-Hop Path Tracer**:
   - Given a Source IP and Destination IP, simulates how packets travel through the network on any historical snapshot day.
   - Performs Longest Prefix Match (LPM) on routing tables, traces 802.1Q trunks across L2 access switches, resolves SVIs, next-hops, and end-host ports via ARP.
   - Detects blackholes, missing routes, down links, and routing loops.

6. **Web Dashboard & Visualizer**:
   - Interactive Vis.js network map with zoom, pan, physics toggle, and click-to-inspect side sheet.
   - Path simulation UI that animates and highlights the traversed path directly on the topology diagram.
   - Searchable device tables, interface details, and investigation alerts.
   - Daily standalone SVG and HTML exports.

---

## Quick Start

### 1. Requirements & Installation
```bash
python -m pip install -r requirements.txt
```

### 2. Run a Mock Crawl (Instant Test without Hardware)
```bash
python main.py crawl --mock
```

### 3. Run a Live SSH Crawl
```bash
python main.py crawl --seeds 10.100.1.1 --username admin --password ciscopassword --workers 15
```

### 4. Trace a Packet Path Hop-by-Hop
```bash
python main.py trace --src 10.10.10.50 --dst 10.20.50.88
```

### 5. Check Failed Devices Flagged for Investigation
```bash
python main.py failed
```

### 6. Compare Two Snapshots (Diff)
```bash
python main.py diff --snap1 1 --snap2 2
```

### 7. Launch the Web Interface
```bash
python main.py web --port 8080
```
Open your browser at `http://localhost:8080`.

---

## Architecture

```
crawler/
├── config.yaml                     # Credentials, seeds, timeouts, naming regex, AP filters
├── main.py                         # Unified CLI entry point
├── netcrawl/
│   ├── models.py                   # Pydantic data models (Device, Interface, Route, Link, PathHop)
│   ├── crawler/
│   │   ├── engine.py               # Concurrent BFS crawl manager
│   │   ├── ssh_client.py           # Netmiko SSH connector with read-only safety guard
│   │   └── mock_network.py         # Simulated virtual campus network (Site 101 & 202)
│   ├── parsers/
│   │   └── ios_parsers.py          # Resilient regex parsers for show commands & AP detection
│   ├── storage/
│   │   └── database.py             # SQLite database manager & JSON snapshot archiver
│   ├── topology/
│   │   └── analyzer.py             # NetworkX topology builder & anomaly detector
│   ├── visualizer/
│   │   └── map_generator.py        # PyVis / Vis.js interactive HTML and SVG generator
│   ├── tracer/
│   │   └── path_tracer.py          # Hop-by-hop L2/L3 path simulation engine
│   ├── web/
│   │   ├── app.py                  # FastAPI web server and REST API
│   │   └── templates/index.html    # Interactive topology & path tracer web dashboard
│   └── scheduler/
│       └── job_runner.py           # Daily & periodic crawl scheduler
└── tests/                          # Pytest test suite (14 automated tests)
```

---

## Running Automated Tests
```bash
python -m pytest -v
```
All 14 tests covering parsers, read-only safety validation, AP filtering, topology correlation, path tracing, and Web REST APIs run and pass.
