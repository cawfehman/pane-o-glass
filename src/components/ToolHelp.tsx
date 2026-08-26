"use client";

import { useState, useEffect } from "react";
import { HelpCircle, X, Shield, Sparkles, AlertCircle, Wrench, Terminal, Key, Cpu, Info, CheckCircle2 } from "lucide-react";

export interface ColorLegendItem {
    name: string;
    meaning: string;
    rgb: string;
}

export interface CapabilityItem {
    title: string;
    detail: string;
    tag?: string;
}

export interface TooltipDetails {
    title: string;
    version?: string;
    category?: string;
    description?: string;
    capabilities: CapabilityItem[];
    colors: ColorLegendItem[];
    shortcuts?: string[];
    backgroundJobs?: string[];
}

export const helpData: Record<string, TooltipDetails> = {
    firewall: {
        title: "Cisco Firewall & Guardian",
        version: "2.0.0",
        category: "Perimeter Defense & ASA Shun Management",
        description: "Real-time perimeter ASA firewall shun management, automated threat detection, and Active Directory LDAP auto-unshun intelligence.",
        capabilities: [
            {
                title: "Perimeter ASA Shun Lookup",
                detail: "Query active IP shuns across all 4 perimeter firewalls simultaneously (Wilmington Primary/Secondary & Keleman Primary/Secondary). Verifies live connection state and blocking policies.",
                tag: "Live Query"
            },
            {
                title: "1-Click Manual Unshun Workflow",
                detail: "Manually remove perimeter shuns to restore false-positive connections. Includes mandatory administrative audit logging with caller username and ticket reference.",
                tag: "Actionable"
            },
            {
                title: "Historical Shun Database & Geolocation",
                detail: "Search persistent historic shun records enriched with IP ASN, Autonomous System Organization, and Geolocation metadata to identify persistent attacker subnets.",
                tag: "Enriched Metadata"
            },
            {
                title: "Guardian Automated Defense Engine",
                detail: "Monitors brute-force attack attempts across edge firewalls. Automatically issues perimeter shuns for high-frequency connection floods and credential attacks.",
                tag: "Auto-Scanner"
            },
            {
                title: "Intelligent LDAP Auto-Unshun",
                detail: "Cross-references failed usernames against Active Directory LDAP. Automatically unshuns valid corporate employees who mistyped their password while keeping malicious external probes blacklisted.",
                tag: "AD Intelligence"
            },
            {
                title: "Blacklist & Catch-Up Operations",
                detail: "Maintain a persistent blacklist of IP addresses barred from auto-unshunning. Execute manual catch-up recovery scans with customizable minute ranges (--range <minutes>).",
                tag: "Admin Controls"
            }
        ],
        colors: [
            { name: "Green (Active / Heartbeat)", meaning: "Guardian defense service is active and scanning, or firewall SSH connection is healthy.", rgb: "#22c55e" },
            { name: "Amber (Warning / Scan Issue)", meaning: "Guardian encountered a temporary scan timeout or non-critical firewall warning.", rgb: "#f59e0b" },
            { name: "Red (Active Perimeter Shun)", meaning: "IP address is actively shunned on Cisco ASA perimeter firewalls.", rgb: "#ef4444" },
            { name: "Purple (Enriched Metadata)", meaning: "Shun record has been enriched with ASN, Geolocation, and Organization details.", rgb: "#a855f7" }
        ],
        shortcuts: [
            "Click [Shun IP] on any external threat log to launch instant firewall shun workflow.",
            "Click [Unshun] to remove an active perimeter block with mandatory audit logging.",
            "Press Esc or click backdrop to close the Help modal."
        ],
        backgroundJobs: [
            "Guardian Automated Scanner: Cron checks host connection statuses and manages threat lists every minute.",
            "Shun Snapshot Sync: Periodically snapshots active shuns across all firewall pairs into SQLite."
        ]
    },
    ise: {
        title: "Cisco ISE Center",
        version: "2.0.0",
        category: "Network Access & Endpoint Triage",
        description: "Query active wired/wireless endpoint connection sessions, diagnose authentication failures, and verify port security.",
        capabilities: [
            {
                title: "Endpoint Session Tracking",
                detail: "Query active wired and wireless endpoint connection sessions by MAC address, username, or IP address. Surfaces active session duration, NAS port, and Network Access Device.",
                tag: "Session Lookup"
            },
            {
                title: "Authentication Protocol Inspection",
                detail: "Inspect user login sessions, Auth protocols (EAP-TLS, PEAP, MAB), Network Devices, and assigned Security Group Tags (SGT) or VLAN assignments.",
                tag: "Protocol Triage"
            },
            {
                title: "Real-Time RADIUS Failure Analysis",
                detail: "Diagnose endpoint authentication failures and policy rejections in real time with 1-click RADIUS packet breakdown (e.g. expired certificates, bad credentials, MAB rejection).",
                tag: "Triage Engine"
            },
            {
                title: "Port Security & Connection Path Verification",
                detail: "Verify live port connection paths (Switch hostname, Interface name, and Port Security profiles) to confirm physical location of connected devices.",
                tag: "Port Audit"
            },
            {
                title: "Corporate Site Directory & Maps",
                detail: "Look up physical corporate site addresses, floor maps, IDF closet assignments, and site contact lists.",
                tag: "Site Directory"
            }
        ],
        colors: [
            { name: "Green (Active / Authenticated)", meaning: "Successful active endpoint authentication and network authorization.", rgb: "#22c55e" },
            { name: "Red (Failure / Rejected)", meaning: "Authentication failure or authorization profile rejection in ISE.", rgb: "#ef4444" },
            { name: "Blue (Informational)", meaning: "Informational syslog profile or session state update.", rgb: "#3b82f6" },
            { name: "Gray (Internal RFC 1918)", meaning: "IP is local/private (RFC 1918) and bypassed external Geolocation.", rgb: "#9ca3af" }
        ],
        shortcuts: [
            "Click any MAC address to copy formatted MAC address to clipboard.",
            "Click [Triage Failure] to view raw RADIUS packet details."
        ]
    },
    vpn: {
        title: "VPN Troubleshooting Dashboard",
        version: "2.5.0",
        category: "Remote Access & Session Telemetry",
        description: "Real-time AnyConnect / Secure Client VPN session tracking, interactive global mapping, bandwidth consumer profiling, and Active Directory LDAP hover cards.",
        capabilities: [
            {
                title: "Natural Language Log Search",
                detail: "Search real-time AnyConnect / Secure Client VPN connection logs using natural date queries (e.g. 'username last 7 days', 'june 6-8', 'last 24 hours').",
                tag: "Flex Search"
            },
            {
                title: "Interactive Connection World & US Map",
                detail: "Visualize active global and domestic VPN tunnels with dual World and US State views, pin clustering, and IPLocate geocoding.",
                tag: "Geo Map"
            },
            {
                title: "24-Hour Capacity & Load Telemetry",
                detail: "Track 24-Hour Peak Unique Users, Average Weekday Users, Average Weekend Users, and active session counts across Keleman & Wilmington clusters.",
                tag: "Capacity Metrics"
            },
            {
                title: "Top Bandwidth Consumer Profiling",
                detail: "Troubleshoot session durations and inspect Top Bandwidth Consumers by upload (Tx), download (Rx), and total byte transfer.",
                tag: "Bandwidth Profiler"
            },
            {
                title: "Active Directory Identity Hover Cards",
                detail: "Hover over any username to trigger real-time Active Directory LDAP cards displaying account status, title, department, Locked Out (🔒), and Disabled flags.",
                tag: "AD Hover"
            },
            {
                title: "Protocol & Gateway Badging",
                detail: "Differentiate SSL (blue) vs IKEv2/IPSec (purple) and Reconnect (Kel-3140 in rose) vs Connect (WDC-FTD in green).",
                tag: "Protocol Badging"
            }
        ],
        colors: [
            { name: "Green (Connected / Active)", meaning: "Client successfully authenticated and established an active VPN tunnel.", rgb: "#22c55e" },
            { name: "Red (Failed Connection)", meaning: "Connection rejected. Displays reason (invalid credentials, certificate failure, timeout).", rgb: "#ef4444" },
            { name: "Amber (International / Non-US)", meaning: "Connection originating from outside the United States. Highlighted for security review.", rgb: "#f59e0b" },
            { name: "Blue (Disconnect / Teardown)", meaning: "Session disconnected cleanly; badge contains duration and byte transfer totals.", rgb: "#3b82f6" },
            { name: "Purple (IKEv2 / IPSec)", meaning: "IKEv2 / IPSec protocol badge.", rgb: "#a855f7" },
            { name: "Rose (Reconnect Gateway)", meaning: "Reconnect stream (Keleman Kel-3140 Reconnect).", rgb: "#ec4899" },
            { name: "Orange Lock Badge (🔒)", meaning: "AD account is actively Locked Out in Active Directory.", rgb: "#ffa500" },
            { name: "Red Warning Badge (⚠️)", meaning: "Username not found in Active Directory (potential typo or external probe).", rgb: "#ff4d4d" }
        ],
        shortcuts: [
            "Hover over any username to open real-time AD user profile card.",
            "Click any IP address on the VPN Map to inspect connection details."
        ],
        backgroundJobs: [
            "Graylog VPN Sync: Ingests VPN authentication, disconnect, and byte stats from Graylog clusters.",
            "IP Geolocation Cache: Auto-enriches and caches regional lat/long coordinates for domestic & global source IPs."
        ]
    },
    'ise-tacacs': {
        title: "TACACS+ Administration Audit",
        version: "1.5.0",
        category: "Infrastructure Privilege Audit",
        description: "Audit administrative logins and CLI command executions across corporate switches, routers, and firewalls.",
        capabilities: [
            {
                title: "Administrative Login Audit",
                detail: "Audit administrative logins to network switches, routers, and firewalls across the infrastructure. Tracks operator IP, target device, and session status.",
                tag: "Device Access"
            },
            {
                title: "Executed CLI Command Search",
                detail: "Search executed CLI commands by network engineer username, target device hostname, or specific command syntax (e.g. 'show running-config', 'configure terminal').",
                tag: "Command History"
            },
            {
                title: "Policy Verification (Permit vs Deny)",
                detail: "Verify command authorization status to confirm policy enforcement and detect unauthorized privilege escalation attempts.",
                tag: "Policy Audit"
            }
        ],
        colors: [
            { name: "Green (Permit)", meaning: "Administrative login or CLI command execution permitted by TACACS+ policy.", rgb: "#22c55e" },
            { name: "Red (Deny)", meaning: "Administrative command execution denied by security policy.", rgb: "#ef4444" }
        ]
    },
    'hibp-account': {
        title: "Have I Been Pwned? Account Security",
        version: "1.5.0",
        category: "Credential Exposure Analysis",
        description: "Check corporate email accounts against public breach datasets and paste sites.",
        capabilities: [
            {
                title: "Account Breach Lookup",
                detail: "Query Have I Been Pwned database to check if a specific corporate account has been exposed in public breach datasets.",
                tag: "HIBP Lookup"
            },
            {
                title: "Incident Exposure Triage",
                detail: "Inspect breach incident summaries, exposure dates, leaked data classes (passwords, emails, phone numbers), and severity scores.",
                tag: "Data Classes"
            },
            {
                title: "Public Paste Site Monitoring",
                detail: "Check public paste sites (Pastebin, Ghostbin) for leaked employee credentials.",
                tag: "Paste Site Scan"
            }
        ],
        colors: [
            { name: "Red Warning", meaning: "Account compromised in one or more breach datasets. Password reset recommended.", rgb: "#ef4444" },
            { name: "Green Check", meaning: "No breach history found for the queried corporate email address.", rgb: "#22c55e" }
        ]
    },
    'hibp-domain': {
        title: "Have I Been Pwned? Domain Security",
        version: "2.5.0",
        category: "Enterprise Domain Exposure Intelligence",
        description: "Query compromised email aliases and credential leaks across all verified organizational domains with active AD enrichment.",
        capabilities: [
            {
                title: "Domain-Wide Breach Intelligence",
                detail: "Query compromised email aliases and credential leaks across all verified organizational domains. Surfaces complete breach history across 140+ breach datasets.",
                tag: "Domain Query"
            },
            {
                title: "Active Directory Identity Enrichment",
                detail: "Real-time AD status (Active in yellow, Disabled in red), Title, Department, Locked status, and Password Last Set date.",
                tag: "AD Status"
            },
            {
                title: "Direct 1-Click Notification Staging",
                detail: "Stage filtered breached employees directly into the Corporate Breach Notification Center for automated security advisory campaigns.",
                tag: "1-Click Handoff"
            },
            {
                title: "1-Click Quick Category Presets",
                detail: "Filter by critical threat categories: Passwords (⚠️), Credit cards (💳), Social security numbers (🪪), Bank account numbers (🏦), Auth tokens (🔑), and Health insurance (🩺).",
                tag: "Risk Presets"
            },
            {
                title: "3-Way Outlook Mail Merge Export Suite",
                detail: "One-click export for Active Accounts Only (Outlook Mail Merge), All Accounts (Mail Merge), or Full Diagnostic CSV.",
                tag: "CSV Export"
            }
        ],
        colors: [
            { name: "Yellow Badge (Active AD Account)", meaning: "Active corporate Active Directory account appearing in breach datasets. Prioritize for notification.", rgb: "#facc15" },
            { name: "Red Badge (Disabled / Locked Account)", meaning: "Disabled or locked corporate account appearing in breach datasets.", rgb: "#ef4444" },
            { name: "⚠️ Red Alert (Passwords / Credentials)", meaning: "Breach dataset exposes user passwords, hints, auth tokens, or encryption keys.", rgb: "#f43f5e" },
            { name: "💳 Amber Credit Card (Financial Data)", meaning: "Breach dataset exposes Credit cards, CVVs, Bank account numbers, or crypto wallets.", rgb: "#f59e0b" },
            { name: "🪪 Purple ID Card (Government ID)", meaning: "Breach dataset exposes Social Security Numbers (SSNs), Passports, or Driver's Licenses.", rgb: "#a855f7" },
            { name: "📈 Pink Activity Pulse (Health Info)", meaning: "Breach dataset exposes Health insurance information, medical records, or biometric data.", rgb: "#ec4899" }
        ],
        shortcuts: [
            "Click [Stage for Notification] to send breached users to the Notification Center.",
            "Click [Export CSV] for instant Outlook Mail Merge spreadsheets."
        ]
    },
    'notification-center': {
        title: "Corporate Breach Notification Center",
        version: "2.2.0",
        category: "Automated Security Advisory Campaigns",
        description: "Stage, review, test, approve, and dispatch customized mail-merge security advisories to impacted corporate staff.",
        capabilities: [
            {
                title: "Centralized Campaign Pipeline",
                detail: "Stage, review, spot-check, test, approve, and dispatch customized mail-merge security advisories to impacted corporate staff.",
                tag: "Campaign Engine"
            },
            {
                title: "Dynamic Mail Merge & Conditional Logic",
                detail: "Automatically populate employee and incident details using {{Name}}, {{Email}}, {{BreachName}}, {{BreachDate}}, {{BreachDetails}}, {{ExposedCategories}}, {{AccountStatus}}, and {{#if Key}} conditional blocks.",
                tag: "Mail Merge"
            },
            {
                title: "Visual WYSIWYG & HTML Template Hub",
                detail: "Create and customize reusable templates with rich-text formatting, bullet lists, Cooper Brand Red (#C3002F) styling, and real-time preview.",
                tag: "Template Editor"
            },
            {
                title: "Sandbox Self-Test Simulator",
                detail: "Test any campaign by selecting an actual recipient and safely routing the test email directly to your logged-in administrator inbox.",
                tag: "Safety Sandbox"
            },
            {
                title: "Throttled Relay Delivery & Recovery",
                detail: "Authorized security staff can review and approve batches, sent with throttled relay delivery. Includes 1-click 'Reset & Retry' for stalled campaign recovery.",
                tag: "Throttled Relay"
            }
        ],
        colors: [
            { name: "Amber (Draft)", meaning: "Campaign is currently staged as a draft and awaiting template assignment or sandbox testing.", rgb: "#f59e0b" },
            { name: "Purple (Sandbox Tested)", meaning: "Sandbox test email was safely dispatched to the administrator inbox for review.", rgb: "#a855f7" },
            { name: "Blue (Sending / In-Flight)", meaning: "Campaign is actively dispatching emails in throttled batches through the corporate relay.", rgb: "#3b82f6" },
            { name: "Orange (Stalled)", meaning: "Dispatch loop was interrupted or crashed mid-run. Requires operator review and reset.", rgb: "#f97316" },
            { name: "Green (Completed)", meaning: "All staged recipient notification emails were successfully delivered.", rgb: "#22c55e" },
            { name: "Rose (Breach Incident)", meaning: "Identifies the source breach or security incident badge on campaign cards.", rgb: "#f43f5e" }
        ]
    },
    'threat-intel': {
        title: "Threat Intelligence Reputation Analyzer",
        version: "2.0.0",
        category: "IOC Analysis & Reputation",
        description: "Perform real-time reputation analysis on public/private IPs, Domain Names, and File Signatures.",
        capabilities: [
            {
                title: "Multi-IOC Reputation Analysis",
                detail: "Perform real-time reputation analysis on public/private IPs, Domain Names, and File Signatures across global threat databases.",
                tag: "IOC Analyzer"
            },
            {
                title: "Authoritative Live DNS Resolution",
                detail: "Resolve live DNS zone records (A, MX, NS, TXT) directly from authoritative DNS servers to spot rogue domain redirects.",
                tag: "DNS Resolution"
            },
            {
                title: "Cisco Umbrella Investigate Categories",
                detail: "Check domain safety, risk classifications, and categories against Cisco Umbrella Investigate database.",
                tag: "Cisco Umbrella"
            },
            {
                title: "Malware Signature & Hash Verification",
                detail: "Scan file hashes (MD5, SHA-1, SHA-256) to identify malware families and threat signatures.",
                tag: "Hash Scan"
            }
        ],
        colors: [
            { name: "Green (Benign / Clean)", meaning: "Indicator is determined to be clean with a risk index close to 0.", rgb: "#22c55e" },
            { name: "Amber (Suspicious)", meaning: "Threat assessment identified potential indicators of compromise (risk index 30-70).", rgb: "#f59e0b" },
            { name: "Red (Malicious)", meaning: "High-severity threat indicators, active ransomware, or flagged C2/malware categories.", rgb: "#ef4444" },
            { name: "Blue (Internal)", meaning: "Private RFC 1918 IP address. Bypasses external reputation checks.", rgb: "#3b82f6" }
        ]
    },
    ironport: {
        title: "Cisco IronPort Email Security & Threat Suite",
        version: "2.6.0",
        category: "Email Security, AMP IOCs & ETD Telemetry",
        description: "Monitor real-time email flow, analyze composite URL threat scores, hunt AMP malware attachment hashes, detect SPF/DMARC spoofing, and trace Cisco ETD post-delivery removals with syntax-highlighted log payloads.",
        capabilities: [
            {
                title: "Per-Message Composite URL Threat Engine & Decayed Priority Score",
                detail: "Auto-aggregates worst WRS scores per MID with 2-step batch lookup across separate syslog events. Applies Decayed Priority Index (Severity x Recency weighting) to keep fresh threats actionable while tracking historic incidents.",
                tag: "Decayed Risk Engine"
            },
            {
                title: "Cisco ETD & ESA Remediation Lifecycle Tracking",
                detail: "Tracks email remediation status with glowing badges: INBOX ACTIVE (🟢), PURGED BY ETD (🩵), and QUARANTINED BY ESA (🟣) across post-delivery clawback events.",
                tag: "Remediation Badges"
            },
            {
                title: "Active Inboxes Only Triage Toggle",
                detail: "1-click toggle to isolate active un-remediated threats sitting in user inboxes from auto-purged or edge-quarantined messages.",
                tag: "Active Inbox Filter"
            },
            {
                title: "50-Item Capacity with 10-per-Page Pagination",
                detail: "Evaluates top 50 high-risk messages across selected timeframe with clean 10-per-page client pagination controls ([◀ Prev], [1], [2], [3], [4], [5], [Next ▶]).",
                tag: "50-Item Pagination"
            },
            {
                title: "Executive Threat Summary Modal & CSV Export",
                detail: "Executive reporting modal summarizing inbound volume, critical threats, and remediated threats with 1-click [Export Executive CSV Report] download.",
                tag: "Executive CSV"
            },
            {
                title: "Inline Syslog Trace Syntax Highlighting Engine",
                detail: "Pivoting into raw log traces automatically highlights MIDs (Blue), URLs (Amber), WRS Scores (Red/Green), Policy Actions (Purple), Emails (Teal), and IPs (Yellow) inside unstructured syslog payloads.",
                tag: "Syntax Highlighter"
            },
            {
                title: "Attachment Malware & AMP IOC Hunting Center",
                detail: "Tracks scanned attachment filenames, AMP reputation verdicts (MALICIOUS, UNKNOWN, CLEAN), and SHA256 hashes with 1-click VirusTotal lookup.",
                tag: "AMP IOC Hunting"
            },
            {
                title: "SPF / DKIM / DMARC Spoofing & ASA Shun Center",
                detail: "Detects external domain spoofing attempts and failed authentication with a 1-click [Shun Sender IP] button to update Cisco ASA firewalls.",
                tag: "1-Click Shun"
            },
            {
                title: "High-Target Employee / VIP Risk Matrix",
                detail: "Ranks internal employees and recipient inboxes by threat volume received and worst URL reputation score into CRITICAL, HIGH, and MODERATE target tiers.",
                tag: "VIP Matrix"
            },
            {
                title: "Per-Appliance Health & Load Balance",
                detail: "Positioned at the top of the Overview tab: monitors ESA01 (esa01.cooperhealth.edu) and ESA02 (esa02.cooperhealth.edu) load distribution and delay queues in real time.",
                tag: "Appliance Load"
            }
        ],
        colors: [
            { name: "🟢 INBOX ACTIVE", meaning: "Email delivered to target user inbox and currently remains active.", rgb: "#10b981" },
            { name: "🩵 PURGED BY ETD", meaning: "Post-delivery clawback executed by Cisco Email Threat Defense.", rgb: "#06b6d4" },
            { name: "🟣 QUARANTINED BY ESA", meaning: "Held in Cisco ESA policy quarantine or dropped at edge.", rgb: "#a855f7" },
            { name: "Deep Red (Score -6.0 to -10.0)", meaning: "Malicious / Critical Block URL score.", rgb: "#ef4444" },
            { name: "Orange (Score -3.0 to -5.9)", meaning: "Risky / Policy Trigger URL scores (aligned 100% to Cisco -3.0 policy trigger).", rgb: "#f97316" },
            { name: "Amber (Score -0.1 to -2.9)", meaning: "Low Suspect URL reputation scores.", rgb: "#f59e0b" },
            { name: "Blue (MIDs & Syslog Tokens)", meaning: "Message ID header & trace highlight token.", rgb: "#3b82f6" },
            { name: "Amber Underline (Syslog URLs)", meaning: "Embedded web links inside raw trace payloads.", rgb: "#f59e0b" }
        ],
        shortcuts: [
            "Click [Trace MID] on any row in the High-Risk Messages table to inspect syntax-highlighted raw syslog threads.",
            "Click [Weekly Executive Report] to view executive threat statistics and export CSV reports.",
            "Use [Active Inboxes Only] toggle to focus exclusively on active, un-handled inbox threats.",
            "Click [Shun Sender IP] in the Spoofing Center to push bad senders directly into your Cisco ASA Shun database.",
            "Click [VirusTotal Lookup] on any AMP SHA256 hash to trigger an instant file threat intelligence report."
        ],
        backgroundJobs: [
            "Graylog Stream 5d7ff82fb209026ab43e167b: Ingests raw ESA syslog events from ESA01 and ESA02.",
            "2-Step Batch MID Lookup: Correlates separate syslog lines (URL score, From, To, Subject) in memory."
        ]
    },
    etd: {
        title: "Cisco Email Threat Defense (ETD) Retrospective Center",
        version: "1.1.0",
        category: "Cloud Post-Delivery Threat Hunting & Remediation",
        description: "Monitor retrospective threat verdicts (Scam, Phishing, Malware), calculate user exposure window deltas, track M365 auto-clawbacks, extract real threat envelope metadata via double-URL decoding, and deep-link directly to Cisco CMD portal incident records.",
        capabilities: [
            {
                title: "2-Pass Envelope Correlation & Double-URL Decoding Engine",
                detail: "Decodes double-URL encoded Cisco CMD parameters inside syslog links to extract the exact original threat sender email, target recipient inbox, original subject line, and original gateway MID.",
                tag: "Envelope Extraction"
            },
            {
                title: "Retrospective Scam, Phish & Malware Verdict Tracking",
                detail: "Collects cloud threat verdicts applied retroactively to messages delivered into user inboxes. Surfaces Message-ID, Subject, Sender, and Recipient.",
                tag: "Retrospective Stream"
            },
            {
                title: "User Exposure Window Delta (Elapsed Mins)",
                detail: "Calculates the exact elapsed minutes between original email arrival and Cisco ETD cloud clawback to identify users who had time to open or click malicious links.",
                tag: "Exposure Delta"
            },
            {
                title: "Direct Cisco CMD Portal Deep Links",
                detail: "Provides 1-click deep links directly to the official Cisco CMD portal incident details (https://portal.cmd.cisco.com/messages?_any=...).",
                tag: "CMD Deep Link"
            },
            {
                title: "1-Click Graylog MID & Message-ID Correlation in New Tab",
                detail: "Instantly opens the IronPort Investigate & Logs tab in a new browser window to inspect the exact gateway ingress logs, connecting IP, and recipient envelope.",
                tag: "MID Trace (New Tab)"
            },
            {
                title: "1-Click Handoff to User Advisory Campaigns",
                detail: "Stage exposed employees directly into the Corporate Breach Notification Center for automated security advisory or credential reset campaigns.",
                tag: "User Advisory"
            }
        ],
        colors: [
            { name: "🟢 PURGED BY ETD", meaning: "Email retroactively clawed back and purged from Microsoft 365 user inbox automatically.", rgb: "#10b981" },
            { name: "🟣 QUARANTINED BY ESA", meaning: "Held in Cisco ESA policy quarantine or dropped at edge.", rgb: "#a855f7" },
            { name: "🔴 PENDING MANUAL REVIEW", meaning: "Retrospective verdict applied but message requires manual SOC inbox review.", rgb: "#ef4444" },
            { name: "🟨 High Exposure Delta (>15 Mins)", meaning: "User had over 15 minutes of exposure before clawback occurred. Recommend security advisory.", rgb: "#f59e0b" }
        ],
        shortcuts: [
            "Click [Export Executive CSV] to generate an audit-ready CSV report of all retrospective threat verdicts.",
            "Click [Trace MID] on any incident to launch full internal syslog thread analysis in a new browser tab.",
            "Click [Open Cisco CMD Portal] for direct deep-link to the official Cisco ETD incident record.",
            "Click [Stage Advisory] on high-exposure incidents to send exposed users directly into the Notification Center."
        ],
        backgroundJobs: [
            "Cisco ETD Service: Outbound polling to Cisco CMD/ETD API & internal Graylog retrospective stream parsing with double-URL decoding.",
            "2-Pass Envelope Correlation: Resolves alert MIDs to original threat gateway MIDs, real senders, target inboxes, and original subjects."
        ]
    }
};

interface ToolHelpProps {
    toolId: string;
    iconSize?: number;
    triggerStyle?: React.CSSProperties;
}

export function ToolHelp({ toolId, iconSize = 20, triggerStyle }: ToolHelpProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"capabilities" | "colors" | "shortcuts">("capabilities");
    const details = helpData[toolId];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        if (isOpen) document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    if (!details) return null;

    return (
        <>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsOpen(true);
                }}
                style={triggerStyle}
                className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1.5 rounded-full inline-flex items-center justify-center transition-all duration-200 align-middle help-trigger-btn hover:bg-white/10 hover:text-[var(--text-primary)] hover:scale-105"
                title={`View ${details.title} Tip Sheet`}
            >
                <HelpCircle size={iconSize} />
            </button>

            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999] flex items-center justify-center p-4 md:p-8"
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-gradient-to-b from-[#1e1e24] to-[#121215] border border-white/15 rounded-2xl w-full max-w-4xl p-6 md:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] relative animate-[fadeIn_0.2s_ease-out] flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-6 right-6 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] cursor-pointer p-2 rounded-xl flex items-center justify-center hover:bg-white/10 hover:text-[var(--text-primary)] transition-all shadow-md"
                        >
                            <X size={20} />
                        </button>

                        {/* Modal Header */}
                        <div className="flex items-start gap-4 mb-5 pr-12">
                            <div className="p-3.5 rounded-2xl bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] shrink-0 shadow-[0_0_20px_rgba(59,130,246,0.25)]">
                                <Shield size={32} />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h2 className="m-0 text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">
                                        {details.title}
                                    </h2>
                                    {details.version && (
                                        <span className="text-xs px-2.5 py-0.5 bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] rounded-md border border-[var(--accent-primary)]/30 font-mono font-bold">
                                            v{details.version}
                                        </span>
                                    )}
                                </div>
                                {details.category && (
                                    <p className="text-xs font-bold text-[var(--text-secondary)] mt-1 uppercase tracking-wider">
                                        {details.category}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Description Quote Banner */}
                        {details.description && (
                            <p className="text-sm text-[var(--text-primary)] bg-[var(--bg-default)] p-4 rounded-xl border border-[var(--border-color)] mb-5 leading-relaxed font-normal shadow-inner">
                                {details.description}
                            </p>
                        )}

                        {/* Modal Navigation Tabs */}
                        <div className="flex border-b border-[var(--border-color)] mb-5 gap-3">
                            <button
                                onClick={() => setActiveTab("capabilities")}
                                className={`px-4 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === "capabilities" ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/5 rounded-t-lg" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                            >
                                <Sparkles size={16} />
                                Capabilities & Uses ({details.capabilities.length})
                            </button>
                            <button
                                onClick={() => setActiveTab("colors")}
                                className={`px-4 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === "colors" ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/5 rounded-t-lg" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                            >
                                <AlertCircle size={16} />
                                Badges & Color Codes ({details.colors.length})
                            </button>
                            {(details.shortcuts || details.backgroundJobs) && (
                                <button
                                    onClick={() => setActiveTab("shortcuts")}
                                    className={`px-4 py-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === "shortcuts" ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/5 rounded-t-lg" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                                >
                                    <Wrench size={16} />
                                    Pro Tips & Jobs
                                </button>
                            )}
                        </div>

                        {/* Scrollable Tab Content Container */}
                        <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar flex flex-col gap-4">
                            {activeTab === "capabilities" && (
                                <div className="flex flex-col gap-3.5">
                                    {details.capabilities.map((cap, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] hover:border-[var(--accent-primary)]/40 transition-all flex flex-col gap-1.5 shadow-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <h4 className="m-0 text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                                    <CheckCircle2 size={16} className="text-[var(--accent-primary)] shrink-0" />
                                                    {cap.title}
                                                </h4>
                                                {cap.tag && (
                                                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                        {cap.tag}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="m-0 text-sm text-[var(--text-secondary)] leading-relaxed pl-6">
                                                {cap.detail}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === "colors" && (
                                <div className="flex flex-col gap-3.5">
                                    {details.colors.map((color, i) => (
                                        <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] shadow-sm">
                                            <div 
                                                className="w-5 h-5 rounded-full mt-0.5 shrink-0 border border-white/20"
                                                style={{ 
                                                    background: color.rgb,
                                                    boxShadow: `0 0 12px ${color.rgb}`
                                                }} 
                                            />
                                            <div className="flex-1 text-sm">
                                                <div className="font-bold text-[var(--text-primary)] flex items-center justify-between gap-2">
                                                    <span className="text-sm font-bold">{color.name}</span>
                                                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/40 text-[var(--text-muted)] border border-white/10">{color.rgb}</span>
                                                </div>
                                                <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">{color.meaning}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === "shortcuts" && (
                                <div className="flex flex-col gap-5">
                                    {details.shortcuts && (
                                        <div>
                                            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Terminal size={16} className="text-amber-400" />
                                                Pro Tips & Interactive Shortcuts
                                            </h4>
                                            <div className="flex flex-col gap-2.5">
                                                {details.shortcuts.map((sc, i) => (
                                                    <div key={i} className="text-sm text-[var(--text-primary)] p-3.5 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] flex items-center gap-3">
                                                        <kbd className="px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] font-mono text-xs text-[var(--accent-primary)] font-bold shrink-0 shadow-sm">
                                                            KEY / CLICK
                                                        </kbd>
                                                        <span className="leading-relaxed">{sc}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {details.backgroundJobs && (
                                        <div>
                                            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Cpu size={16} className="text-cyan-400" />
                                                Background Services & Ingest Engine
                                            </h4>
                                            <div className="flex flex-col gap-2.5">
                                                {details.backgroundJobs.map((job, i) => (
                                                    <div key={i} className="text-sm text-[var(--text-secondary)] p-3.5 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] leading-relaxed">
                                                        {job}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="mt-5 pt-4 border-t border-[var(--border-color)] flex justify-between items-center text-xs text-[var(--text-muted)]">
                            <div className="flex items-center gap-2">
                                <Key size={14} className="text-[var(--accent-primary)]" />
                                <span className="font-medium">Role-based Security Utility • Pane-O-Glass</span>
                            </div>
                            <span className="font-mono text-xs font-bold">Press Esc to close</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
