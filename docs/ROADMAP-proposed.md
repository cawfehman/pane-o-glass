# Pane-O-Glass — Proposed Roadmap (comparison draft)

> **Status:** Alternative proposal for comparison only.  
> Does **not** replace the existing Antigravity brain `roadmap.md`.  
> Written: 2026-08-06 · Author: Grok (review)

This document reorganizes goals by **risk reduction and operator value**, marks what the codebase already does, and adds housekeeping the original roadmap omits. Each item has a clear **done when**.

---

## How to read this

| Field | Meaning |
|--------|---------|
| **Status** | `Done` · `Partial` · `Planned` · `In flight` · `Parked` |
| **Effort** | S (hours–1 day) · M (few days) · L (1–2 weeks) · XL (multi-week vertical) |
| **Depends on** | Soft ordering; not a hard gate unless noted |

---

## 0. Recently Completed & Shipped Tranches

### 0.1 Corporate Breach Notification Center (v2.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | L |
| **Why** | Eliminate manual mail-merge overhead and provide a secure, audited pipeline for employee breach notifications. |
| **Capabilities** | • Visual WYSIWYG & HTML dual-mode template editor with Cooper Brand Red (`#C3002F`) & conditional blocks (`{{#if}}`).<br>• Staged campaign workflow: `DRAFT` ➔ `TEST_SENT` ➔ `APPROVED` ➔ `SENDING` ➔ `COMPLETED` / `COMPLETED_WITH_ERRORS` / `STALLED`.<br>• Sandbox self-test simulator strictly restricted to internal `@cooperhealth.edu` addresses.<br>• 1-Click HIBP Domain query handoff to stage breached accounts directly.<br>• CSV validator with 5MB size cap, email deduplication, and paginated spot-checking.<br>• Client-side delivery log CSV export.<br>• Fail-closed SMTP relay with crash-recovery (`↺ Reset & Retry` & `Retry Failed`).<br>• Zero-dependency native DOM HTML sanitizer for preview pane. |

### 0.2 IronPort / OG Graylog Telemetry Dashboard
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | M–L |
| **Why** | Pull enterprise email security telemetry into a unified analyst pane. |
| **Capabilities** | • Real-time inbound/outbound volume, queue delays, URL rewrites, and antivirus/AMP verdicts.<br>• Appliance load distribution tracking for ESA01 and ESA02.<br>• Ad-hoc Lucene search across raw Cisco IronPort syslog streams.<br>• Complete MID lifecycle thread tracing.<br>• Protected behind role-based access control (`ironport` permission). |

### 0.3 VPN Geolocation Engine & Map Overhaul
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | S–M |
| **Why** | Fix centroid stacking (119+ connections in Kansas) and provide real-time connection mapping. |
| **Capabilities** | • Batch chunking (50 IPs/chunk) for `iplocate.io` API limits.<br>• Increased batch enrichment ceiling to 500 IPs.<br>• Automatic background geocoding on initial map load in both World and US States views.<br>• Cached 390+ unique VPN connection endpoints (tri-state area). |

### 0.4 Production SQLite WAL Mode Hardening
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | S |
| **Evidence** | `PRAGMA journal_mode = WAL;` enabled live on production host `infosecutil02`. Eliminated reader/writer locking bottlenecks. |

---

## 1. Verified & Housekeeping Tranches

### 1.1 Audit log cleanup as a background job
| | |
|---|---|
| **Status** | `Done` |
| **Effort** | S |
| **Evidence** | `scripts/cron/audit-cleanup.ts`; `logAudit` no longer prunes on write. |

### 1.2 Baseline rate limiting
| | |
|---|---|
| **Status** | `Done` (In-Memory) |
| **Effort** | S |
| **Evidence** | In-memory limiter in `src/lib/rate-limit.ts`, applied in `src/proxy.ts` (auth ~50/min, API ~200/min). |

---

## 2. Platform Foundation (Proposed “6.0”)

Goal of this tranche: **eliminate concurrency bottlenecks and harden security credentials**.

### 2.1 PostgreSQL Migration
| | |
|---|---|
| **Status** | `Planned` (Priority: High due to Write Contention) |
| **Effort** | L |
| **Why** | Prod `VpnEvent` has crossed **1.06M rows (328 MB)**. Background crons (`sync-vpn-logs`, `auto-unshun`, `shun-snapshot`, `ironport`) + live web actions (campaign dispatching, CSV staging) all contend for a single SQLite write lock. |
| **Approach** | Provision Postgres ➔ Update Prisma provider (`provider = "postgresql"`) ➔ Run schema push/migrations ➔ Transfer hot tables (`VpnEvent`, `AuditLog`, `IpLookupCache`, `ShunDatabaseIp`, `CampaignRecipient`) ➔ Cut over app & cron workers. |
| **Done when** | Concurrent cron log ingestion and user campaign dispatching execute with zero lock latency. |

### 2.2 VPN Telemetry Retention / Pruning Cron (Interim Optimization)
| | |
|---|---|
| **Status** | `Planned` (Quick Win) |
| **Effort** | S |
| **Why** | `VpnEvent` grows by ~350,000 rows/month (~100 MB/mo). Since raw syslogs live in Graylog, pruning events older than 90 days keeps SQLite capped at ~150 MB until Postgres migration. |
| **Done when** | Weekly prune of records older than 90 days. |

### 2.3 Shared Internal HTTPS / Trust Store (TLS)
| | |
|---|---|
| **Status** | Planned |
| **Effort** | M |
| **Why** | Dozens of `rejectUnauthorized: false` copies; MitM risk on ISE, Graylog, Vectra, VPN collectors, etc. |
| **Approach** | See companion section in chat / §A below: one agent factory + `NODE_EXTRA_CA_CERTS` (or explicit CA bundle), remove bypasses on production code paths first; lab scripts opt-in to insecure. |
| **Done when** | No unconditional `rejectUnauthorized: false` in `src/` or `scripts/cron/`; internal CA documented in ops runbook. |
| **Depends on** | Access to org Root/Issuing CA PEM. |

### 2.4 Secrets via Delinea (Production)
| | |
|---|---|
| **Status** | Planned |
| **Effort** | L |
| **Why** | Long-lived secrets in `.env` on disk; no rotation story. |
| **Approach** | Fetch at process start (or short TTL cache); map Secret Server fields → existing env names so call sites barely change; keep `.env` for local dev. |
| **Done when** | Prod box has no plaintext API passwords in `.env` for ISE/AD/firewall/Graylog/HIBP/Umbrella; rotation tested. |
| **Depends on** | Delinea API access + network path from app host. |

### 2.5 Replace Rotating Wordlist Credentials
| | |
|---|---|
| **Status** | Planned |
| **Effort** | M |
| **Why** | ~230-word / 2-minute password for machine surfaces (`vpn/events`, system-health) is guessable offline. |
| **Approach** | Prefer **hashed API keys / service tokens** in DB (or Delinea-issued) for automation. TOTP only if humans must type something. |
| **Done when** | Wordlist module unused in prod paths; tokens rotatable and audited. |
| **Depends on** | Soft: nicer with Delinea, not required. |

### 2.6 Input Validation Standard (IPs first)
| | |
|---|---|
| **Status** | Planned |
| **Effort** | S–M |
| **Why** | Manual IP entry / future webhooks without validation corrupt data or open injection edge cases. |
| **Approach** | Shared `parseIp()` using `node:net` `isIPv4`/`isIPv6` (Zod optional for broader forms); apply on all POST bodies that accept IPs. |
| **Done when** | All IP-accepting API routes reject invalid input with 400. |

---

## 3. Product Enhancements (Proposed “6.x”)

Order by **desk time saved / leverage**, not coolness.

### 3.1 External Shun / Enrichment Lookup API
| | |
|---|---|
| **Status** | Planned |
| **Effort** | M |
| **Why** | Other tools re-query IPLocate or reinvent shun context; Pane-O-Glass already centralizes this. |
| **Approach** | `GET /api/v1/shun-database/lookup/:ip` (or POST batch); API key auth; stable JSON contract. |
| **Done when** | Documented endpoint + at least one external consumer or curl runbook; rate-limited. |
| **Depends on** | Soft: Postgres if traffic is high; API keys (2.5). |

### 3.2 Threat Intel: GreyNoise (+ optional Shodan)
| | |
|---|---|
| **Status** | Planned |
| **Effort** | M (GreyNoise) · M (Shodan) |
| **Why** | Faster triage: “internet noise vs targeted” (GreyNoise); optional attack surface (Shodan). |
| **Approach** | Backend fetchers + Threat Intel UI + reuse on IP popovers (shun/VPN). Start GreyNoise; add Shodan if budget/value clear. |
| **Done when** | Analyst can enrich an IP without leaving the app; keys in secrets path. |

### 3.3 Microsoft Defender for Endpoint (Host Pivot)
| | |
|---|---|
| **Status** | Planned |
| **Effort** | XL |
| **Why** | Network pane without host timeline still forces a portal hop. |
| **Approach** | Treat as full vertical (Azure app reg, Graph/Defender APIs, RBAC, UI). MVP: machine search + recent alerts/timeline by hostname/device ID. |
| **Done when** | From a VPN/ISE identity, one click to host activity summary. |
| **Depends on** | Azure AD app + security review; not a side bullet of 6.0. |

### 3.4 Server-Side User Preferences
| | |
|---|---|
| **Status** | Planned |
| **Effort** | M |
| **Why** | Theme, shun columns, VPN row counts live in `localStorage` → lost across machines. |
| **Approach** | `User.preferences` JSON + `useUserPreferences` hook; migrate local keys on first login. |
| **Done when** | Theme + major table prefs follow the user account. |

---

## 4. Parked (Explicit Non-Goals for Now)

### Social Media IOC Scanning (X / Twitter)
| | |
|---|---|
| **Status** | Parked |
| **Why park** | API/ToS fragility, noise, maintenance tax; poor fit next to reliable log panes. |
| **Revisit if** | Leadership mandates OSINT automation; prefer “paste IOC list → match internal logs” first. |

---

## 5. Housekeeping (High ROI for Clarity)

| Item | Effort | Done when | Status |
|---|---|---|---|
| Commit this roadmap family into the git repo (`docs/`) | S | Visible in clone / PRs | `Done` |
| Clean deploy scripts (`package.json`) to standard npm versioning | S | `npm run deploy:patch` runs without legacy strings | `Done` |
| Zero-dependency client HTML sanitizer (`src/lib/sanitizeHtml.ts`) | S | Prevents XSS without brittle CJS/Turbopack breakage | `Done` |
| In-App Tool Help Documentation updated to v2.0 | S | Covers Notification Center, pagination, recovery statuses | `Done` |
| Retention cron for `VpnEvent` (90-day sliding window) | S | Weekly prune of records older than 90 days | `Planned` |
| Script taxonomy: `cron` (prod) vs `lab`/`discovery` | S–M | `build:scripts` only ships prod crons | `Planned` |
| Typed session helper (`role`, permissions) instead of `(session.user as any)` | S–M | New tools don’t re-cast | `Planned` |

---

## 6. Suggested Sequencing

```text
Shipped (Aug 2026) ──► Corporate Breach Notification Center (v2.0)
                   ──► IronPort / OG Graylog Dashboard
                   ──► VPN Geolocation Engine Fix & Auto-Enrichment
                   ──► Production SQLite WAL Mode Enabled (infosecutil02)

Next Up (Tranche 1) ──► 2.2 VPN 90-Day Retention / Pruning Cron (Keep SQLite lean)
                    ──► 2.1 PostgreSQL Migration Planning (Eliminate write contention)
                    ──► 2.3 Shared Internal TLS / CA Helper

Next Up (Tranche 2) ──► 2.5 API Service Tokens / Kill Wordlist Auth
                    ──► 3.1 External Shun Lookup API
                    ──► 3.2 GreyNoise Threat Intel Integration

Future Verticals    ──► 2.4 Delinea Secret Server Integration
                    ──► 3.3 Microsoft Defender for Endpoint Pivot
```

---

## 7. Mapping vs Original Roadmap

| Original Item | Status in This Roadmap |
|---|---|
| **Corporate Breach Notification Center** | `Done` (§0.1) |
| **IronPort Telemetry** | `Done` (§0.2) |
| **VPN Geolocation Engine** | `Done` (§0.3) |
| **Production SQLite WAL Mode** | `Done` (§0.4) |
| **PostgreSQL Migration** | `Planned` (§2.1 — High Priority for Write Contention) |
| **VPN 90-Day Retention Cron** | `Planned` (§2.2 — Short-term Quick Win) |
| **Enforce Internal TLS** | `Planned` (§2.3) |
| **Delinea Secret Server** | `Planned` (§2.4) |
| **Replace Rotating Wordlist Passwords** | `Planned` (§2.5) |
| **External Shun Lookup API** | `Planned` (§3.1) |
| **GreyNoise Threat Intel** | `Planned` (§3.2) |
| **Microsoft Defender Pivot** | `Planned` (§3.3 — XL Vertical) |
| **Server-Side User Preferences** | `Planned` (§3.4) |
| **Social Media IOCs** | `Parked` (§4) |

---

## Changelog

| Date | Note |
|---|---|
| 2026-08-18 | Updated roadmap with shipped deliverables (Notification Center v2.0, IronPort Dashboard, VPN Geo Engine, SQLite WAL hardening). Prioritized Postgres & Retention for write contention mitigation. |
| 2026-08-06 | Initial comparison draft from codebase review + original roadmap. |

---

## Appendix A — Shared HTTPS helper (design sketch)

**Problem today:** every client builds:

```ts
new https.Agent({ rejectUnauthorized: false })
```

**Target:**

```ts
// src/lib/http/internal-agent.ts
import https from "https";
import fs from "fs";

export function getInternalHttpsAgent(): https.Agent {
  // Trust default CAs + optional extra PEM (org root)
  // Never disable verification in production paths.
  return new https.Agent({
    // rejectUnauthorized defaults to true
  });
}
```

**Ops side:** set on the server process:

```bash
export NODE_EXTRA_CA_CERTS=/etc/pki/pane-o-glass/org-root.pem
```

Node then trusts your internal CA for **all** TLS clients that use the default trust store (including axios if you don’t pass a custom agent that disables verification).

**Escape hatch (lab only):**

```bash
ALLOW_INSECURE_TLS=1  # scripts/discovery only; log a loud warning
```

Full explanation of cert chain, `NODE_EXTRA_CA_CERTS`, and agent lifetime: see discussion accompanying this doc.

---

## Appendix B — Rate limiting & Redis/Upstash (decision note)

| Deployment shape | Recommendation |
|------------------|----------------|
| **Single Next.js process** on one host (current likely shape) | Keep **in-memory** map; document limits; optionally persist login lockouts in SQLite/Postgres. |
| **Multiple Node workers / multiple hosts** | Shared store needed → Redis or equivalent (Upstash is hosted Redis). |
| **No multi-node plan** | Do **not** add Redis only for rate limits — ops cost without benefit. |

