# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pane-O-Glass is a role-based InfoSec utility suite (Next.js 16 App Router, React 19, Prisma/PostgreSQL, NextAuth v5, Tailwind v4). It fronts many security/network systems — Cisco FTD/FMC firewalls, ISE, Meraki, NetScaler, IronPort/ETD, Graylog, Vectra, Umbrella, HIBP, Active Directory — and adds Python SSH tooling for direct device access.

## Commands

```bash
npm run dev                # Next dev server on :3000
npm run build              # clean → prisma generate → Tailwind CLI → esbuild cron scripts → next build → PM2 post-build hook
npx eslint .               # lint (`npm run lint` calls `next lint`, which Next 16 no longer provides)
npx tsc --noEmit           # type-check; next.config.mjs sets ignoreBuildErrors, so `next build` does NOT catch type errors
npx prisma db push         # sync schema to DATABASE_URL (no migrations directory; the schema is pushed)
npm run test:setup         # seed Playwright users (password `testpassword123`)
npm test                   # Playwright (chromium + firefox); starts `npm run dev` automatically
npx playwright test tests/rbac.spec.ts --project=chromium   # single file / single browser
npx playwright test -g "test name"                          # single test by title
cd services/crawler && python -m pytest -v                  # Python crawler tests
```

Initial admin/permission seeding: visit `/api/seed` once the dev server is running. Copy `.env.template` to `.env`; it lists the env vars for every integration.

`npm run deploy*` pushes to the `production` git remote (the post-receive hook builds on the server). Don't run it unless asked.

## Architecture

### Request pipeline and auth
- `src/proxy.ts` is the Next 16 middleware (formerly `middleware.ts`). It rate-limits auth routes and `/api/*` and redirects unauthenticated users. Public exceptions: `/api/health`, `/api/auth`, `/api/feeds/*`, `/public/*`.
- `src/lib/auth.config.ts` holds the edge-safe config. `src/lib/auth.ts` holds the full Credentials provider: local bcrypt users (`isExternal=false`) or AD/LDAP bind (`src/lib/ldap.ts`). For AD users, the role is derived from AD group CN membership unless `isRoleOverridden` is set.

### RBAC (tool-level permissions)
- Tools and roles are declared in `src/lib/permissions-constants.ts` (`TOOLS`, `ROLES`, `SYSTEM_DEFAULT_PERMISSIONS_MAP`). **Adding a new tool means adding it there.**
- Effective access = DB `ToolPermission` rows (role × tool, editable in the admin UI) + per-user `UserToolOverride`. These are resolved by server actions in `src/app/actions/permissions.ts`.
- Every API route follows the same guard pattern (see `src/app/api/hibp/route.ts`): `auth()` → `hasPermission(role, '<toolId>')` → on failure, `logAudit("UNAUTHORIZED_ACCESS", ...)` and return 403. Admin-only actions use `ensureAdmin()`.

### Audit logging
Every diagnostic or mutating action calls `logAudit(action, details, userId, clientIp)` from `src/lib/audit.ts`. Client IP comes from the first `x-forwarded-for` entry. Sensitive identifiers are masked before logging (`src/lib/obfuscation.ts`). New endpoints are expected to audit the same way.

### Layout
- `src/app/(dashboard)/queries/<tool>/` holds the per-tool UI pages; `src/app/api/<tool>/` holds the matching route handlers; `src/components/<tool>/` holds the tool components. The sidebar (`src/components/Sidebar.tsx`) renders server-side from the resolved permissions.
- `src/lib/` holds all integration clients and business logic (e.g. `fmc-client.ts`, `ise.ts`, `umbrella.ts`, `vectra.ts`, `og-graylog.ts`, `shun-sync.ts`, `login-anomaly-engine.ts`). API routes and cron scripts both import from here via the `@/` alias.
- `src/lib/prisma.ts` is the singleton Prisma client. `prisma/schema.prisma` (PostgreSQL) is authoritative. `schema.sqlite.prisma` is legacy and is used only by `scripts/migration/`.

### Background jobs (`scripts/cron/`)
These are TypeScript daemons and cron jobs (VPN log sync, Citrix/NetScaler guardian auto-shun, health probes, AnyConnect prewarm, account lifecycle sync, telemetry). `npm run build:scripts` bundles them with esbuild into `dist-scripts/` (with `@` aliased to `./src`). The `cron:*` and `daemon:*` npm scripts run the bundled output, so **rebuild scripts after changing `src/lib` code they import**. In production they run under PM2. `scripts/utils/sync-post-receive-pm2.js` restarts them after each build (Linux only).

### Python execution layer
- `services/crawler/` contains NetCrawl, a standalone Python Cisco IOS crawler and path tracer (netmiko). It has its own README, config, Docker setup and pytest suite. It enforces a strict read-only command whitelist, and that guarantee must be preserved. It is invoked from `src/app/api/crawler/crawl/route.ts` via `spawn`.
- `services/firewall/ftd_client.py` is the FTD SSH client for S2S VPN diagnostics. It is invoked with `execFile(python, [script, "--json", ...])` from `src/lib/s2s-vpn.ts`.
- Both resolve the interpreter as `python3`/`python` (`python`/`py` on Windows).

### Misc
- `scratch/`, `scripts/debug/`, `scripts/discovery/`, `scripts/test/` and `scripts/archive/` contain one-off investigation scripts, not part of the app.
- Tool-specific docs live in `docs/` (`crawler.md`, `vpn-s2s.md`, `account-lockout.md`, `design-document.md`).
