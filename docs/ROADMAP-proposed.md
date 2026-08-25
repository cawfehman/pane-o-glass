# Pane-O-Glass — Master Roadmap & Release Tracking

> **Last Updated:** August 25, 2026  
> **Status:** Production Release Tracking & Future Milestones

---

## 0. Recently Completed & Shipped Releases

### 0.1 IronPort Threat Intelligence & Phishing Triage Suite (v2.5.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 25, 2026) |
| **Effort** | L |
| **Why** | Transform raw email syslog streams into actionable threat intelligence, AMP malware hunting, and 1-click firewall shunning. |
| **Capabilities** | • **Per-Message Composite WRS Threat Score Widget:** Aggregates worst WRS scores per `MID` with a 2-step batch lookup to extract `Subject`, `Sender`, and `Recipient` envelope headers across separate syslog events.<br>• **5-Tier Official Cisco WRS Threshold Alignment:** Aligned reputation tiers to Cisco's official policy rewrite scale (`+3.0 to +10.0` Emerald, `0.0 to +2.9` Blue, `-0.1 to -2.9` Amber, `-3.0 to -5.9` Orange, `-6.0 to -10.0` Deep Red).<br>• **Attachment Malware & AMP IOC Hunting Center:** Tracks scanned attachment filenames, AMP verdicts (`MALICIOUS`, `UNKNOWN`, `CLEAN`), and SHA256 hashes with 1-click VirusTotal threat intel lookup.<br>• **SPF / DKIM / DMARC Spoofing Center & 1-Click ASA Shun:** Detects domain spoofing senders and failed authentication with a 1-click **`[Shun Sender IP]`** button to update Cisco ASA perimeter firewalls.<br>• **High-Target Employee / VIP Risk Matrix:** Ranks internal employees by threat volume received into `CRITICAL`, `HIGH`, and `MODERATE` target tiers.<br>• **Cisco ETD Post-Delivery Removal Readout (Read-Only):** Displays Message-ID, Subject, Recipient Inbox, ETD Threat Verdict, and Auto-Remediation Status.<br>• **17 Master Graylog Ingest Extractors:** Configured and deployed Graylog Extractor bundle for `esa_mid`, `esa_icid`, `esa_dcid`, `esa_mail_from`, `esa_rcpt_to`, `esa_subject`, `esa_rfc_message_id`, `esa_sending_ip`, `esa_url_rep_score` (float), `esa_amp_sha256`, `esa_amp_file_name`, `esa_amp_file_verdict`, `esa_spf_verdict`, `esa_dkim_verdict`, `esa_dmarc_verdict`, `esa_policy`, `esa_cisco_action`. |

### 0.2 Universal Tool Help System Makeover (v2.5.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 25, 2026) |
| **Effort** | S–M |
| **Why** | Redesign help documentation interface across all security tools for high readability and interactive pro tips. |
| **Capabilities** | • 3-Tab Segmented Design (`Capabilities & Uses`, `Badges & Color Codes`, `Pro Tips & Jobs`).<br>• Glowing color swatches with exact HEX/RGB chips.<br>• Interactive shortcuts and background job documentation across all 9 tools. |

### 0.3 Corporate Breach Notification Center (v2.2.0)
| | |
|---|---|
| **Status** | `Done` (Shipped Aug 2026) |
| **Effort** | L |
| **Capabilities** | • Visual WYSIWYG & HTML dual-mode template editor with Cooper Brand Red (`#C3002F`) & conditional blocks (`{{#if}}`).<br>• Staged campaign workflow: `DRAFT` ➔ `TEST_SENT` ➔ `APPROVED` ➔ `SENDING` ➔ `COMPLETED` / `COMPLETED_WITH_ERRORS` / `STALLED`.<br>• Sandbox self-test simulator strictly restricted to internal `@cooperhealth.edu` addresses.<br>• 1-Click HIBP Domain query handoff to stage breached accounts directly.<br>• CSV validator with 5MB size cap, email deduplication, and paginated spot-checking. |

### 0.4 VPN Geolocation Engine & Map Overhaul (v2.5.0)
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

### 1.2 Cisco ETD Active 1-Click Inbox Purge Execution
| | |
|---|---|
| **Status** | `Parked` (Held off per user preference; readout dashboard operational in read-only mode) |
| **Effort** | M |

---

## 2. Platform Foundation & Technical Debt

### 2.1 PostgreSQL Database Migration
| | |
|---|---|
| **Status** | `Planned` (Priority: High due to Write Contention) |
| **Effort** | L |
| **Why** | Prod `VpnEvent` has crossed **1.06M rows (328 MB)**. Background crons (`sync-vpn-logs`, `auto-unshun`, `shun-snapshot`, `ironport`) + live web actions all contend for a single SQLite write lock. |

### 2.2 Shared Internal HTTPS / Trust Store (TLS)
| | |
|---|---|
| **Status** | `Planned` |
| **Effort** | M |
| **Why** | Enforce global TLS certificate validation across internal ISE, Graylog, and Vectra endpoints. |
