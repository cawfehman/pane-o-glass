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

## 0. In flight (do not lose track)

### IronPort / OG Graylog telemetry
| | |
|--|--|
| **Status** | In flight (`feature/ironport-dashboard`) |
| **Effort** | M–L |
| **Why** | Same product motion as VPN/firewall: pull messy enterprise logs into one analyst UI. |
| **Done when** | Stats + investigate search ship behind RBAC (`ironport` permission), env documented, TLS path decided (insecure agent temporary or CA-backed). |

---

## 1. Already done or nearly done (verify, then close)

### 1.1 Audit log cleanup as a background job
| | |
|--|--|
| **Status** | Done (verify in prod) |
| **Effort** | S |
| **Evidence** | `scripts/cron/audit-cleanup.ts`; `logAudit` no longer prunes on write. |
| **Done when** | Production crontab/systemd timer runs cleanup daily; System Health shows last success. |

### 1.2 Baseline rate limiting
| | |
|--|--|
| **Status** | Partial |
| **Effort** | S to document; M to harden login |
| **Evidence** | In-memory limiter in `src/lib/rate-limit.ts`, applied in `src/proxy.ts` (auth ~50/min, API ~200/min). |
| **Done when** | Limits documented; login failures also counted/audited; decision recorded: single-node memory is enough (see Redis note below). |

---

## 2. Platform foundation (proposed “6.0”)

Goal of this tranche: **stop fighting the infrastructure** so feature work is safer.

### 2.1 PostgreSQL migration
| | |
|--|--|
| **Status** | Planned |
| **Effort** | L |
| **Why** | SQLite single-writer + concurrent crons (VPN sync, Guardian, shun snapshots, audit) → lock contention / Prisma timeouts. |
| **Approach** | Provision Postgres → Prisma provider swap → migrate schema → transfer hot tables (`VpnEvent`, shun/guardian history, audit) → repoint app + crons → keep SQLite backup until confidence. Prefer explicit data move over “let crons refill” for forensic tables. |
| **Done when** | App + all prod crons use Postgres under concurrent load with no lock timeouts; rollback path documented. |
| **Depends on** | Nothing hard; do before heavy new write-heavy features. |

### 2.2 Shared internal HTTPS / trust store (TLS)
| | |
|--|--|
| **Status** | Planned |
| **Effort** | M |
| **Why** | Dozens of `rejectUnauthorized: false` copies; MitM risk on ISE, Graylog, Vectra, VPN collectors, etc. |
| **Approach** | See companion section in chat / §A below: one agent factory + `NODE_EXTRA_CA_CERTS` (or explicit CA bundle), remove bypasses on production code paths first; lab scripts opt-in to insecure. |
| **Done when** | No unconditional `rejectUnauthorized: false` in `src/` or `scripts/cron/`; internal CA documented in ops runbook. |
| **Depends on** | Access to org Root/Issuing CA PEM. |

### 2.3 Secrets via Delinea (production)
| | |
|--|--|
| **Status** | Planned |
| **Effort** | L |
| **Why** | Long-lived secrets in `.env` on disk; no rotation story. |
| **Approach** | Fetch at process start (or short TTL cache); map Secret Server fields → existing env names so call sites barely change; keep `.env` for local dev. |
| **Done when** | Prod box has no plaintext API passwords in `.env` for ISE/AD/firewall/Graylog/HIBP/Umbrella; rotation tested. |
| **Depends on** | Delinea API access + network path from app host. |

### 2.4 Replace rotating wordlist credentials
| | |
|--|--|
| **Status** | Planned |
| **Effort** | M |
| **Why** | ~230-word / 2-minute password for machine surfaces (`vpn/events`, system-health) is guessable offline. |
| **Approach** | Prefer **hashed API keys / service tokens** in DB (or Delinea-issued) for automation. TOTP only if humans must type something. |
| **Done when** | Wordlist module unused in prod paths; tokens rotatable and audited. |
| **Depends on** | Soft: nicer with Delinea, not required. |

### 2.5 Input validation standard (IPs first)
| | |
|--|--|
| **Status** | Planned |
| **Effort** | S–M |
| **Why** | Manual IP entry / future webhooks without validation corrupt data or open injection edge cases. |
| **Approach** | Shared `parseIp()` using `node:net` `isIPv4`/`isIPv6` (Zod optional for broader forms); apply on all POST bodies that accept IPs. |
| **Done when** | All IP-accepting API routes reject invalid input with 400. |

---

## 3. Product enhancements (proposed “6.x”)

Order by **desk time saved / leverage**, not coolness.

### 3.1 External shun / enrichment lookup API
| | |
|--|--|
| **Status** | Planned |
| **Effort** | M |
| **Why** | Other tools re-query IPLocate or reinvent shun context; Pane-O-Glass already centralizes this. |
| **Approach** | `GET /api/v1/shun-database/lookup/:ip` (or POST batch); API key auth; stable JSON contract. |
| **Done when** | Documented endpoint + at least one external consumer or curl runbook; rate-limited. |
| **Depends on** | Soft: Postgres if traffic is high; API keys (2.4). |

### 3.2 Threat intel: GreyNoise (+ optional Shodan)
| | |
|--|--|
| **Status** | Planned |
| **Effort** | M (GreyNoise) · M (Shodan) |
| **Why** | Faster triage: “internet noise vs targeted” (GreyNoise); optional attack surface (Shodan). |
| **Approach** | Backend fetchers + Threat Intel UI + reuse on IP popovers (shun/VPN). Start GreyNoise; add Shodan if budget/value clear. |
| **Done when** | Analyst can enrich an IP without leaving the app; keys in secrets path. |

### 3.3 Microsoft Defender for Endpoint (host pivot)
| | |
|--|--|
| **Status** | Planned |
| **Effort** | XL |
| **Why** | Network pane without host timeline still forces a portal hop. |
| **Approach** | Treat as full vertical (Azure app reg, Graph/Defender APIs, RBAC, UI). MVP: machine search + recent alerts/timeline by hostname/device ID. |
| **Done when** | From a VPN/ISE identity, one click to host activity summary. |
| **Depends on** | Azure AD app + security review; not a side bullet of 6.0. |

### 3.4 Server-side user preferences
| | |
|--|--|
| **Status** | Planned |
| **Effort** | M |
| **Why** | Theme, shun columns, VPN row counts live in `localStorage` → lost across machines. |
| **Approach** | `User.preferences` JSON + `useUserPreferences` hook; migrate local keys on first login. |
| **Done when** | Theme + major table prefs follow the user account. |

---

## 4. Parked (explicit non-goals for now)

### Social media IOC scanning (X / Twitter)
| | |
|--|--|
| **Status** | Parked |
| **Why park** | API/ToS fragility, noise, maintenance tax; poor fit next to reliable log panes. |
| **Revisit if** | Leadership mandates OSINT automation; prefer “paste IOC list → match internal logs” first. |

---

## 5. Housekeeping (anytime; high ROI for clarity)

Not glamorous; keeps the pane glass instead of fog.

| Item | Effort | Done when |
|------|--------|-----------|
| Commit this roadmap family into the git repo (`docs/`) | S | Visible in clone / PRs |
| README matches product (name, version story, real tools list) | S | New admin can install from README alone |
| Script taxonomy: `cron` (prod) vs `lab`/`discovery` (not deployed) | S–M | `build:scripts` only ships prod crons |
| Ignore / remove lab artifacts from deploy path (`fix*.js`, samples, `tsc-errors*`, huge CSVs) | S | Cleaner tree; no surprise multi‑MB deploys |
| CSS/build story documented (why compiled Tailwind is committed, single pipeline) | S | No more “padding via inline style” fire drills without a root-cause note |
| Typed session helper (`role`, permissions) instead of `(session.user as any)` | S–M | New tools don’t re-cast |
| Job observability: every cron updates `BackgroundJob` + retention for noisy tables | M | Health page trustworthy |
| USER role intent decision | S | Either real limited tools or documented “restricted analyst only” |

---

## 6. Suggested sequencing

```text
Now ──► Finish IronPort (0)
     ──► Close 1.x verify items
     ──► 2.2 TLS helper (unblocks clean IronPort/ISE clients)
     ──► 2.1 Postgres if lock contention is painful in prod
     ──► 2.4 API keys  ·  2.5 IP validation  ·  5 housekeeping (parallel)

Then ──► 3.1 Shun lookup API  and/or  3.2 GreyNoise
     ──► 2.3 Delinea when secrets project can be scheduled
     ──► 3.4 Preferences when UI friction hurts
     ──► 3.3 Defender as its own project
```

**If only three investments this quarter:**

1. Postgres (if prod contention is real) **or** TLS shared helper (if not — cheaper security win).  
2. Finish/verify rate limit + kill rotating wordlist on exposed machine APIs.  
3. One product surface: IronPort ship **or** shun lookup API **or** GreyNoise.

---

## 7. Mapping vs original roadmap

| Original item | This proposal |
|---------------|----------------|
| PostgreSQL | Keep — platform 2.1, first-class |
| Delinea | Keep — 2.3, after or parallel to TLS |
| Enforce TLS | Keep — 2.2, expanded with shared helper design |
| Global rate limiting | Reframe — Partial; harden, don’t re-buy Redis unless multi-node |
| Rotating passwords | Keep — 2.4, prefer API keys over TOTP for machines |
| Audit cleanup → cron | Close — verify prod schedule |
| External shun API | Keep — 3.1 |
| Defender | Keep — 3.3 as XL vertical |
| Shodan & GreyNoise | Keep — 3.2, GreyNoise first |
| Social media IOCs | Park |
| Strict IP validation | Keep — 2.5 |
| Roaming preferences | Keep — 3.4, lower priority |
| *(missing)* IronPort | Added — §0 |
| *(missing)* Housekeeping | Added — §5 |

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

Original roadmap’s “upstash/ratelimit or Redis” is fine as a **future** option; it is not required to “complete” rate limiting for a single-box internal app.

---

## Changelog

| Date | Note |
|------|------|
| 2026-08-06 | Initial comparison draft from codebase review + original roadmap. |
