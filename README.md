# InfoSec Tools (v1.0.0)

A hardened, role-based Information Security utility suite built with Next.js, Prisma, and Tailwind.

## 🚀 Features

- **Dynamic Permission Engine**: Granular control over tool visibility per role (Admin, Analyst, User).
- **Security Integrations**: 
  - **HIBP**: Account and Domain breach searching via Have I Been Pwned.
  - **Network Tools**: Cisco Firewall shun management and ISE Session tracking.
- **Enterprise Ready**:
  - LDAP/Active Directory integration for external authentication.
  - Comprehensive Audit Logging with CSV export.
  - Role-based Dashboard and system health metrics.
- **Public Utilities**: External-facing password security check with NO account requirement.

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+
- SQLite (Local development)

### Installation
1. Clone the repository.
2. `cp .env.template .env` and fill in your secure secrets and integration IPs.
3. `npm install`
4. `npx prisma db push` (Synchronize schema)
5. `npm run dev`

### Initial Seeding
To set up the default admin user and initial permissions, visit:
`http://localhost:3000/api/seed`

## ⚙️ Production Operations

### Deploying Changes
Standard deployments are handled via:
`npm run deploy` (Standard patch/sync)
`npm run deploy:minor` or `npm run deploy:major` for larger releases.

### Database Synchronization
If new tables or schema changes are added, run this on the production server:
```bash
npx prisma db push
```

### Diagnostics
Administrators can use the **Tool Permissions** page to:
- Run Server Diagnostics (checks paths and DB connectivity).
- View Technical Logs (secure remote log retrieval).
- Reset Defaults (realign permissions if corrupted).

## 🔒 Security Notice
All sensitive utility executions (Firewall, ISE, HIBP) are logged to the Audit database. Logs are automatically purged every 30 days to save space while maintaining compliance.
