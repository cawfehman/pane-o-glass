# Pane-O-Glass (formerly InfoSec Tools)

Pane-O-Glass is a hardened, role-based Information Security utility suite. It provides a "single pane of glass" bridging modern web interfaces with legacy and physical infrastructure, allowing network and security analysts to rapidly investigate, monitor, and mitigate network events safely.

## 🚀 Key Features

- **Network Discovery & Mapping (NetCrawl)**
  - SSH-based network crawler mapping Cisco IOS infrastructure.
  - Generates interactive physical/logical topologies (VLANs, Port Channels, routing tables).
  - Hop-by-Hop Path Tracer to simulate packet flow.
- **S2S VPN Diagnostics (FTD Client)**
  - Real-time diagnostic dashboard for Site-to-Site VPNs.
  - **Dual Diagnostic Telemetry:** Correlates true L3 network reachability (ICMP sourced from the firewall) with L7 cryptographic IKEv2/IPsec status.
  - Safe-mode bouncing and re-keying (dry-run previews).
- **Identity & Threat Integrations**
  - **Cisco ISE:** Live user session tracking.
  - **Have I Been Pwned (HIBP):** Account and Domain breach auditing.
- **Enterprise Controls**
  - Granular Role-Based Access Control (RBAC) via dynamic permission matrices.
  - Comprehensive Audit Logging for every diagnostic and mutation command.
  - Ephemeral credential support for executing sensitive networking tasks.

## 🛠️ Architecture
- **Frontend / Backend Orchestrator:** Next.js (React) + Tailwind CSS.
- **Database / ORM:** Prisma (SQLite/PostgreSQL) managing RBAC and audit data.
- **Network Execution Layer:** Python standalone CLI tools (`netmiko`) operating via SSH for raw network communication.

## 🏁 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- SQLite (for local development)

### Installation
1. Clone the repository.
2. Copy `.env.template` to `.env` and fill in necessary environmental variables. *(Do not commit credentials to source control)*.
3. Install Node dependencies: `npm install`
4. Synchronize Prisma schema: `npx prisma db push`
5. Start development server: `npm run dev`

### Initial Seeding
To set up the default admin user and initial permissions, visit: `http://localhost:3000/api/seed`

## 📖 Documentation Reference
Detailed help files and usage guides for the backend CLI tools are available in the `docs/` folder:
- [S2S VPN Monitor & FTD Client Docs](docs/vpn-s2s.md)
- [NetCrawl Network Topology Docs](docs/crawler.md)

## 🔒 Security Notice
All sensitive utility executions are permanently logged to the Audit database. Logs are retained for compliance and operational review. Ephemeral credentials supplied during runtime are held strictly in memory and are never persisted to disk.
