# Pane-O-Glass — Master Roadmap & Release Tracking

> **Last Updated:** September 3, 2026  
> **Status:** Production Release Tracking & Future Milestones

---

## 0. Recently Completed & Shipped Releases

### 0.1 Cisco Umbrella BEC Threat Intelligence & Unwrapped URL Search Suite (v6.3.11)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 30, 2026) |
| **Effort** | L |
| **Why** | Provide deep threat intelligence, Newly Observed Domain (NOD) anomaly detection, and Cisco Umbrella reputation categorization for over 500,000 unwrapped email destination URLs. |
| **Capabilities** | • **PostgreSQL Wildcard & Domain Search:** High-speed search (`0.2s`) by wildcard domain (`*.claims`, `*.zip`, `*.top`, `*.xyz`, `*.ru`), full URL substring, MID, or recipient inbox.<br>• **First-Seen (`firstSeen`) NOD Tracking:** Tracks earliest appearance (`MIN(createdAt)`) across 500,000+ records. Badges include 🆕 `FIRST SEEN <24H` (Red), ⚠️ `FIRST SEEN <7D` (Amber), and `Established`.<br>• **Rare Frequency Anomaly Engine:** Highlights established domains seen $\le$3 times total with 🚨 `RARE (Seen 2x)` anomaly badges.<br>• **Cisco Umbrella Domain Enrichment:** Live domain lookup via Cisco Umbrella Investigate API. Returns `umbrellaStatus` (-1: Malicious, 0: Uncategorized, 1: Benign), security threat categories (`Phishing`, `Botnet`, `Malware`), and content categories (`Business`, `Webmail`).<br>• **Threat Analytics Visualizations:** Real-time visual cards displaying Cisco Umbrella Domain Reputation distribution, Top Security Threat Categories progress bars, and Top Content Categories progress bars.<br>• **1-Click Expandable Message Context Drawer:** Inline drawer for MID, Recipient, Sender, Subject, and 1-Click Trace MID in ESA. |

### 0.2 Guardian Unshun Intelligence & 30-Day Audit Suite (v6.3.13)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 31, 2026) |
| **Effort** | S–M |
| **Why** | Expand visibility into perimeter firewall auto-unshun decisions and retain complete audit logs across a 30-day rolling window. |
| **Capabilities** | • **Configurable Fetch Limits:** Upgraded `/api/firewall/guardian` API to support custom fetch limits (`Top 100`, `Top 250`, `Top 500` [default], `Top 1,000`, `Fetch All 30 Days`).<br>• **30-Day PostgreSQL History Access:** Full access to all 30 days of historical shun, auto-unshun, and safety-retained audit logs.<br>• **1-Click CSV Export:** Export complete Guardian unshun & retained safety audit records into a clean `.csv` file. |

### 0.3 IPLocate Geolocation Engine & Rate Limit Protection (v6.3.10)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 29, 2026) |
| **Effort** | S |
| **Why** | Standardize IP geolocation on IPLocate API exclusively and protect against paid API rate limit exhaustion. |
| **Capabilities** | • Standardized IPLocate API integration across all VPN map and endpoint enrichment modules.<br>• Daily lookup tracking & reserve credit logging to ensure smooth failover and limit enforcement. |

### 0.4 Full Codebase Modularization & TypeScript Migration (v6.3.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 29, 2026) |
| **Effort** | L |
| **Why** | Decompose complex UI monoliths, migrate inline styles to Tailwind CSS v4, and enforce strict TypeScript safety across all background scripts. |
| **Capabilities** | • **UI Monolith Decomposition:** Refactored complex components (e.g. `Site Mapping` and `VpnWorldMap`) into modular sub-components (`MapCanvas`, `MapControls`, `MapTooltip`, `MapFilters`).<br>• **Tailwind v4 Migration:** Converted inline styles to Tailwind CSS v4 classes across 20+ query pages.<br>• **Flexbox Internal Scroll Standard:** Enforced `internal-scroll-layout` pattern with fixed top tool headers and scrollable table viewports.<br>• **Full Script TS Migration:** Converted all scripts in `scripts/cron/`, `scripts/utils/`, `scripts/debug/`, `scripts/seed/`, `scripts/test/`, and `scripts/discovery/` to TypeScript (`npx tsc --noEmit` clean). |

### 0.5 Enterprise PostgreSQL Database Migration (v6.0.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 27, 2026) |
| **Effort** | L |
| **Why** | Replaced single-threaded SQLite database with enterprise PostgreSQL 16 database instance to eliminate write lock contention. |
| **Capabilities** | • Complete schema and data migration for `VpnEvent` (1M+ rows), `BecRawUrl` (500k+ rows), `AuditLog`, `User`, and `BackgroundJob`.<br>• Configured PostgreSQL tuning parameters (`shared_buffers = 4GB`, `effective_cache_size = 12GB`, `max_parallel_workers = 4`). |

### 0.6 VPN Event Reporting & Audit Suite (v1.0.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 28, 2026) |
| **Effort** | M |
| **Why** | Provide dedicated audit reporting for AnyConnect / Secure Client VPN events separate from real-time troubleshooting, restricted to Admin, Analyst, and Network roles. |
| **Capabilities** | • **Targeted User & IP Multi-Field Search:** Instant search by username, assigned IP, public source IP, or failure reason.<br>• **Flexible Timeframes & Custom Date Picker:** Filter by 1h, 24h, 7d, 30d, All Time, or custom ISO start/end date range picker.<br>• **Event Status Isolation:** Isolate `SUCCESS`, `FAILURE`, or `DISCONNECT` event types.<br>• **1-Click Un-Truncated CSV Export:** Export complete telemetry datasets including bytes transferred, session duration, and ISP metadata into CSV format.<br>• **Default RBAC Enforcement:** Enabled by default ONLY for `ADMIN`, `ANALYST`, and `NETWORK` roles (`vpn-reporting` permission key). |

### 0.7 M365 BEC Threat Hunter & High-Watermark Checkpoint Engine (v2.0.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 28, 2026) |
| **Effort** | L |
| **Why** | Detect Business Email Compromise (BEC) login link impersonation attacks with a 24x7 High-Watermark checkpoint daemon. |
| **Capabilities** | • **High-Watermark Delta Windowing:** Queries Graylog using exact timestamp checkpoints stored in PostgreSQL `BackgroundJob`. Eliminates mass-marketing scan redundancy.<br>• **M365 OAuth & Auth Portal Classifier:** Evaluates links against 14 official Microsoft Entra ID endpoints, pinpointing fake login portals (`+10.0`) and OAuth token theft (`+6.0`).<br>• **Real-Time Dynamic Stats API:** Direct PostgreSQL aggregation (`0.3s`) across 6 dynamic timeframes (10m, 30m, 1h, 4h, 12h, 24h). |

### 0.8 IronPort Threat Intelligence & Phishing Triage Suite (v2.5.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 25, 2026) |
| **Effort** | L |
| **Why** | Transform raw email syslog streams into actionable threat intelligence, AMP malware hunting, and 1-click firewall shunning. |
| **Capabilities** | • **Per-Message Composite WRS Threat Score Widget:** Aggregates worst WRS scores per `MID` with a 2-step batch lookup to extract `Subject`, `Sender`, and `Recipient` envelope headers across separate syslog events.<br>• **5-Tier Official Cisco WRS Threshold Alignment:** Aligned reputation tiers to Cisco's official policy rewrite scale (`+3.0 to +10.0` Emerald, `0.0 to +2.9` Blue, `-0.1 to -2.9` Amber, `-3.0 to -5.9` Orange, `-6.0 to -10.0` Deep Red).<br>• **Attachment Malware & AMP IOC Hunting Center:** Tracks scanned attachment filenames, AMP verdicts (`MALICIOUS`, `UNKNOWN`, `CLEAN`), and SHA256 hashes with 1-click VirusTotal threat intel lookup.<br>• **SPF / DKIM / DMARC Spoofing Center & 1-Click ASA Shun:** Detects domain spoofing senders and failed authentication with a 1-click **`[Shun Sender IP]`** button to update Cisco ASA perimeter firewalls.<br>• **High-Target Employee / VIP Risk Matrix:** Ranks internal employees by threat volume received into `CRITICAL`, `HIGH`, and `MODERATE` target tiers.<br>• **Cisco ETD Post-Delivery Removal Readout (Read-Only):** Displays Message-ID, Subject, Recipient Inbox, ETD Threat Verdict, and Auto-Remediation Status.<br>• **17 Master Graylog Ingest Extractors:** Configured and deployed Graylog Extractor bundle for `esa_mid`, `esa_icid`, `esa_dcid`, `esa_mail_from`, `esa_rcpt_to`, `esa_subject`, `esa_rfc_message_id`, `esa_sending_ip`, `esa_url_rep_score` (float), `esa_amp_sha256`, `esa_amp_file_name`, `esa_amp_file_verdict`, `esa_spf_verdict`, `esa_dkim_verdict`, `esa_dmarc_verdict`, `esa_policy`, `esa_cisco_action`. |

### 0.9 Universal Tool Help System Makeover (v2.5.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 25, 2026) |
| **Effort** | S–M |
| **Why** | Redesign help documentation interface across all security tools for high readability and interactive pro tips. |
| **Capabilities** | • 3-Tab Segmented Design (`Capabilities & Uses`, `Badges & Color Codes`, `Pro Tips & Jobs`).<br>• Glowing color swatches with exact HEX/RGB chips.<br>• Interactive shortcuts and background job documentation across all 9 tools. |

### 0.10 Corporate Breach Notification Center (v2.2.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | L |
| **Capabilities** | • Visual WYSIWYG & HTML dual-mode template editor with Cooper Brand Red (`#C3002F`) & conditional blocks (`{{#if}}`).<br>• Staged campaign workflow: `DRAFT` ➔ `TEST_SENT` ➔ `APPROVED` ➔ `SENDING` ➔ `COMPLETED` / `COMPLETED_WITH_ERRORS` / `STALLED`.<br>• Sandbox self-test simulator strictly restricted to internal `@cooperhealth.edu` addresses.<br>• 1-Click HIBP Domain query handoff to stage breached accounts directly.<br>• CSV validator with 5MB size cap, email deduplication, and paginated spot-checking. |

### 0.11 VPN Geolocation Engine & Map Overhaul (v2.5.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | S–M |
| **Capabilities** | • Batch chunking for `iplocate.io` API limits.<br>• Automatic background geocoding on initial map load in both World and US States views.<br>• Cached 390+ unique VPN connection endpoints (tri-state area). |

---

## 1. Active & Upcoming Security Tool Integrations

### 1.1 Vectra Investigate API Integration
| | |
|---|---|
| **Status** | `Planned` / `Next Up` |
| **Effort** | M |
| **Why** | Surface Vectra AI host/account threat scores and correlate network detections with Firewall/ISE/VPN logs. |
| **Capabilities** | • Leverage `src/lib/vectra.ts` API wrappers (`getVectraHosts`, `getVectraAccounts`, `queryVectraMetadata`).<br>• Interactive `/queries/vectra` UI module with threat score sorting and host triaging. |

### 1.2 Active Directory Moves, Adds, Changes (MAC) & 360° Audit Investigation Suite
| | |
|---|---|
| **Status** | `Planned` / `Backburnered` |
| **Effort** | M–L |
| **Why** | Provide a centralized security audit and investigation workbench for Active Directory account lifecycles, group membership modifications, lockout forensics, and OU moves across all Domain Controllers. |
| **Capabilities** | • **Hybrid Multi-DC Architecture:** Combines Graylog REST API (`OgGraylogClient`) as the unified multi-DC event aggregator with live LDAP (`src/lib/ldap.ts`) for real-time account state & group membership snapshots.<br>• **Comprehensive Event ID Matrix:**<br>&nbsp;&nbsp;– 🔒 *Lockouts & Credential Attempts:* `4740` (Lockout with `CallerComputerName`), `4767` (Unlock), `4771` (Kerberos Pre-Auth Bad Password), `4776` (NTLM Bad Password `0xC000006A`), `4723`/`4724` (Password Change/Reset).<br>&nbsp;&nbsp;– 🔑 *Auth & Privilege Delegation:* `4625` (Logon Failure with Reason Codes `0xC000006A`/`0xC0000234`/`0xC0000072`), `4624` (Logon Success), `4648` (Explicit Creds / RunAs), `4672` (Elevated Admin Token), `4769` (Kerberoasting footprint).<br>&nbsp;&nbsp;– 👤 *Account Lifecycle & Moves:* `4720` (Creation), `4726` (Deletion), `4722`/`4725` (Enable/Disable), `4738` (Attribute Edits), `5136`/`5139` (OU Relocations & DS Modifications).<br>&nbsp;&nbsp;– 👥 *Group Access Audit:* `4728`/`4729` (Global), `4732`/`4733` (Local), `4756`/`4757` (Universal) Security Group additions & removals.<br>• **Unified Lucene Boolean Search Engine:** Reuses standard Pane-o-Glass search interface with full native Lucene boolean support (`AND`, `OR`, `NOT`, quotes `"..."`, field prefixes e.g. `EventID:4740 AND TargetUserName:jdoe`).<br>• **1-Click Quick Preset Chips:** Shortcuts for 🚨 Lockouts, 🟢 Account Creations, 🔴 Deletions, 🔒 Status Toggles, 🔐 Password Resets, 👥 Group Changes, and 📝 OU Moves.<br>• **Flexible Timeframe Selector & 360° Timeline View:** Relative range picker (1h, 24h, 7d, 30d) + custom ISO date range picker with 1-click CSV export.

### 1.3 Ingest-Time Cisco Umbrella Pre-Categorization & Background Worker
| | |
|---|---|
| **Status** | `Planned` |
| **Effort** | S–M |
| **Why** | Automatically pre-categorize newly observed email domains upon ingestion so unsearched domains are pre-populated with Cisco Umbrella threat scores in PostgreSQL. |
| **Capabilities** | • Trigger live Umbrella lookup for new domains detected by `monitor-bec-threats.ts`.<br>• Background cron worker to enrich un-categorized historical domains within daily API quota limits. |

### 1.3 Cisco ETD Active 1-Click Inbox Purge Execution
| | |
|---|---|
| **Status** | `Parked` (Held off per user preference; readout dashboard operational in read-only mode) |
| **Effort** | M |

---

## 2. Platform Foundation & Technical Infrastructure

### 2.1 Shared Internal HTTPS / Trust Store (TLS)
| | |
|---|---|
| **Status** | `Planned` |
| **Effort** | M |
| **Why** | Enforce global TLS certificate validation across internal ISE, Graylog, and Vectra endpoints. |

---

## 3. Quick Reference Release History

| Version | Highlights | Release Date |
|---|---|---|
| **v6.3.13** | Guardian Unshun Logs 30-Day Audit Suite & CSV Export | Aug 31, 2026 |
| **v6.3.11** | Cisco Umbrella BEC Threat Intelligence & Unwrapped URL Search | Aug 30, 2026 |
| **v6.3.10** | IPLocate Geolocation Engine & Rate Limit Protection | Aug 29, 2026 |
| **v6.3.0** | Codebase Modularization, Tailwind v4, & Script TS Migration | Aug 29, 2026 |
| **v6.0.0** | Enterprise PostgreSQL 16 Database Migration | Aug 27, 2026 |
| **v2.5.0** | IronPort Threat Intelligence & Phishing Triage Suite | Aug 25, 2026 |
| **v2.2.0** | Corporate Breach Notification Center & HIBP Integration | Aug 2026 |
| **v1.0.0** | VPN Event Reporting & Audit Suite | Aug 28, 2026 |
