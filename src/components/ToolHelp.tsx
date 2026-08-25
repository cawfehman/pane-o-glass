"use client";

import { useState, useEffect } from "react";
import { HelpCircle, X, Shield, Sparkles, AlertCircle, Wrench, Terminal, Key, Cpu } from "lucide-react";

export interface ColorLegendItem {
    name: string;
    meaning: string;
    rgb: string;
}

export interface TooltipDetails {
    title: string;
    version?: string;
    category?: string;
    description?: string;
    capabilities: string[];
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
            "Query active IP shuns across all 4 perimeter firewalls (Wilmington Primary/Secondary & Keleman Primary/Secondary).",
            "1-Click Unshun: Manually remove shuns to restore false-positive connections with administrative audit logging.",
            "Historical Shun Database: Search persistent historic shun records enriched with IP ASN, Organization, and Geolocation metadata.",
            "Hourly Shun Snapshots: Audit historical shun snapshot logs across all perimeter firewall pairs.",
            "Guardian Automated Defense: Monitors brute-force attack attempts and automatically shuns malicious IPs.",
            "Intelligent Auto-Unshun: Validates failed usernames against Active Directory LDAP; auto-unshuns valid employees who mistyped passwords while blacklisting external attackers.",
            "Guardian Blacklist Management: Maintain a persistent blacklist of IP addresses barred from auto-unshunning.",
            "Catch-Up Scans: Execute manual recovery scans with customizable minute ranges (--range <minutes>)."
        ],
        colors: [
            { name: "Green (Active / Heartbeat)", meaning: "Guardian service is active and scanning, or firewall connection is healthy.", rgb: "#22c55e" },
            { name: "Amber (Warning / Scan Issue)", meaning: "Guardian encountered a temporary scan issue or firewall warning.", rgb: "#f59e0b" },
            { name: "Red (Active Perimeter Shun)", meaning: "IP address is actively shunned on Cisco ASA perimeter firewalls.", rgb: "#ef4444" },
            { name: "Purple (Enriched Metadata)", meaning: "Shun record has been enriched with ASN, Geolocation, and Organization details.", rgb: "#a855f7" }
        ],
        shortcuts: [
            "Click [Shun IP] on any external threat log to launch instant firewall shun.",
            "Click [Unshun] to remove an active perimeter block with mandatory audit logging.",
            "Press Esc or click backdrop to close the Help modal."
        ],
        backgroundJobs: [
            "Guardian Automated Scanner: Cron checks host connection statuses and manages threat lists.",
            "Shun Snapshot Sync: Periodically snapshots active shuns across all firewall pairs."
        ]
    },
    ise: {
        title: "Cisco ISE Center",
        version: "2.0.0",
        category: "Network Access & Endpoint Triage",
        description: "Query active wired/wireless endpoint connection sessions, diagnose authentication failures, and verify port security.",
        capabilities: [
            "Query active wired and wireless endpoint connection sessions by MAC address, username, or IP address.",
            "Inspect user login sessions, Auth protocols (EAP-TLS, PEAP, MAB), Network Devices, and VLAN assignments.",
            "Failure Triage & Analysis: Diagnose endpoint authentication failures and policy rejections in real time.",
            "Verify live port connection paths (Switch, Interface, and Port Security profiles).",
            "Corporate Site Directory: Look up physical addresses, floor maps, and site contact lists."
        ],
        colors: [
            { name: "Green (Active / Authenticated)", meaning: "Successful active endpoint authentication and network authorization.", rgb: "#22c55e" },
            { name: "Red (Failure / Rejected)", meaning: "Authentication failure or authorization profile rejection.", rgb: "#ef4444" },
            { name: "Blue (Informational)", meaning: "Informational syslog profile status.", rgb: "#3b82f6" },
            { name: "Gray (Internal RFC 1918)", meaning: "IP is local/private (RFC 1918) and bypassed external Geolocation.", rgb: "#9ca3af" }
        ],
        shortcuts: [
            "Click any MAC address to copy formatted MAC address.",
            "Click [Triage Failure] to view raw RADIUS packet details."
        ]
    },
    vpn: {
        title: "VPN Troubleshooting Dashboard",
        version: "2.5.0",
        category: "Remote Access & Session Telemetry",
        description: "Real-time AnyConnect / Secure Client VPN session tracking, interactive global mapping, bandwidth consumer profiling, and Active Directory LDAP cards.",
        capabilities: [
            "Search real-time AnyConnect / Secure Client VPN connection logs using natural date queries (e.g. 'username last 7 days', 'june 6-8', 'last 24 hours').",
            "Interactive Connection Map: Visualize active global and domestic VPN tunnels with dual World and US State views, pin clustering, and IPLocate geocoding.",
            "Capacity & Load Telemetry: Track 24-Hour Peak Unique Users, Average Weekday Users, Average Weekend Users, and active session counts.",
            "Session Bandwidth Analysis: Troubleshoot session durations and inspect Top Bandwidth Consumers by upload (Tx), download (Rx), and total transfer.",
            "Security Insights: Audit top failed usernames (with Active Directory format validation), top failed ASNs, and international non-US connections.",
            "Identity Hover Popovers: Hover over any username to trigger real-time Active Directory LDAP cards with Locked Out (🔒) and Disabled account detection.",
            "Protocol & Stream Badging: Differentiate SSL (blue) vs IKEv2/IPSec (purple) and Reconnect (Kel-3140 in rose) vs Connect (WDC-FTD in green)."
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
            "Audit administrative logins to network switches, routers, and firewalls across the infrastructure.",
            "Search executed CLI commands by network engineer username, target device, or keyword.",
            "Verify command authorization status to confirm policy enforcement (Permit vs Deny logs)."
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
            "Query Have I Been Pwned database to check if a specific corporate account has been exposed in public breach datasets.",
            "Inspect breach incident summaries, exposure dates, leaked data classes (passwords, emails, phone numbers), and severity scores.",
            "Check public paste sites (Pastebin, Ghostbin) for leaked employee credentials."
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
            "Domain-Wide Breach Intelligence: Query compromised email aliases and credential leaks across all verified organizational domains.",
            "Active Directory Identity Enrichment: Real-time AD status (Active in yellow, Disabled in red), Title, Department, Locked status, and Password Last Set date.",
            "Direct 1-Click Notification Staging: Stage filtered breached employees directly into the Corporate Breach Notification Center.",
            "Unified Breach & Category Filtering: Search by breach name (e.g. LinkedIn, Adobe) or filter across 140+ compromised data categories with ALL/ANY matching logic.",
            "1-Click Quick Category Presets: Filter by critical threat categories: Passwords (⚠️), Credit cards (💳), Social security numbers (🪪), Bank account numbers (🏦), Auth tokens (🔑), and Health insurance (🩺).",
            "Multi-Category Risk Badges: Standardized SVG badges appear consistently across cards and tables.",
            "Interactive Breach Details Modal: View full incident writeups, global pwn counts, compromised data attributes, and organizational impact.",
            "3-Way CSV Export Suite: One-click export for Active Accounts Only (Outlook Mail Merge), All Accounts (Mail Merge), or Full Diagnostic CSV."
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
            "Centralized Campaign Management: Stage, review, spot-check, test, approve, and dispatch customized mail-merge security advisories to impacted corporate staff.",
            "Dynamic Mail Merge & Conditional Logic: Automatically populate employee and incident details using {{Name}}, {{Email}}, {{BreachName}}, {{BreachDate}}, {{BreachDetails}}, {{ExposedCategories}}, {{AccountStatus}}, and {{#if Key}} conditional blocks.",
            "Visual WYSIWYG & HTML Template Hub: Create and customize reusable templates with rich-text formatting, bullet lists, Cooper Brand Red (#C3002F) styling, and real-time preview.",
            "Paginated Spot-Checking & Search: Search and inspect staged recipient lists and delivery logs with custom page limits (10, 15, 25, 50, 100) and instant query matching.",
            "1-Click CSV Delivery Export: Download complete delivery logs with recipient emails, names, timestamps, delivery verdicts, and failure error messages.",
            "Sandbox Self-Test Simulator: Test any campaign by selecting an actual recipient and safely routing the test email directly to your logged-in administrator inbox.",
            "Smart Duplicate & Size Guards: Automatic de-duplication of email addresses from uploaded CSVs and browser memory guards.",
            "Campaign Recovery & Retry: 1-click 'Retry Failed' for partial completions and 'Reset & Retry' for stalled dispatch recovery.",
            "Role-Based Self-Approval & Throttled Queue: Authorized security staff can review and approve batches, sent with throttled relay delivery.",
            "Direct 1-Click HIBP Integration: Seamlessly stage active accounts from any HIBP Domain Security search directly into the Notification Center."
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
            "Perform real-time reputation analysis on public/private IPs, Domain Names, and File Signatures.",
            "Resolve live DNS zone records (A, MX, NS, TXT) directly from authoritative DNS servers.",
            "Check domain safety, risk classifications, and categories against Cisco Umbrella Investigate database.",
            "Scan file hashes (MD5, SHA-1, SHA-256) to identify malware families and threat signatures.",
            "Audit Logging: Automatically record indicator lookups in central audit database."
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
        version: "2.5.0",
        category: "Email Security, AMP IOCs & ETD Telemetry",
        description: "Monitor real-time email flow, analyze composite URL threat scores, hunt AMP malware attachment hashes, detect SPF/DMARC spoofing, and trace Cisco ETD post-delivery removals.",
        capabilities: [
            "Per-Message Composite URL Threat Score: Auto-aggregates worst WRS scores per MID with 2-step batch lookup to surface Subject, Sender, and Recipient headers.",
            "Attachment Malware & AMP IOC Hunting Center: Tracks scanned attachment filenames, AMP reputation verdicts (MALICIOUS, UNKNOWN, CLEAN), and SHA256 hashes with 1-click VirusTotal lookup.",
            "SPF / DKIM / DMARC Spoofing & Firewall Shun Center: Detects external domain spoofing attempts and failed authentication with a 1-click [Shun Sender IP] button to update Cisco ASA firewalls.",
            "High-Target Employee / VIP Risk Matrix: Ranks internal employees and recipient inboxes by threat volume received and worst URL reputation score into CRITICAL, HIGH, and MODERATE target tiers.",
            "Cisco ETD Post-Delivery Removal Readout (Read-Only): Displays Message-ID, Subject Line, Target User Inbox, ETD Threat Verdict, and Auto-Remediation Status.",
            "Clean Delivered Mail & Whitelisted Flow: Aligned 1:1 with Cisco SMA categories (Standard Inbound Policy vs Whitelisted Senders).",
            "Appliance Health & Load Balance: Monitors ESA01 (esa01.cooperhealth.edu) and ESA02 (esa02.cooperhealth.edu) load distribution in real time.",
            "Dynamic Scalable Timeframes: Filter telemetry seamlessly across 1h, 6h, 12h, 24h, 3d, and 7d.",
            "Numeric Timeline Scaling: Renders continuous multi-line time-series trends comparing total inbound mail against whitelisted policy streams.",
            "1-Click Graylog Thread Tracing: Click any Message ID (MID) or Message-ID header badge to isolate raw syslog threads."
        ],
        colors: [
            { name: "Emerald Green (Score +3.0 to +10.0)", meaning: "Clean / Established mail passing all security & WRS reputation rules cleanly.", rgb: "#10b981" },
            { name: "Blue (Score 0.0 to +2.9)", meaning: "Neutral / Uncategorized mail flow.", rgb: "#3b82f6" },
            { name: "Amber (Score -0.1 to -2.9)", meaning: "Low Suspect URL reputation scores.", rgb: "#f59e0b" },
            { name: "Orange (Score -3.0 to -5.9)", meaning: "Risky / Policy Trigger URL scores (aligned 100% to Cisco -3.0 policy trigger).", rgb: "#f97316" },
            { name: "Deep Red (Score -6.0 to -10.0)", meaning: "Malicious / Critical Block URL score.", rgb: "#ef4444" },
            { name: "Purple (Whitelisted Senders)", meaning: "Inbound messages allowed via Whitelisted Addresses policy stream.", rgb: "#a855f7" },
            { name: "Cyan (Cisco ETD / Message-ID)", meaning: "Cisco Email Threat Defense Message-ID header correlation & ESA01 traffic.", rgb: "#06b6d4" }
        ],
        shortcuts: [
            "Click [Trace MID] on any row in the High-Risk Messages table to inspect raw syslog threads.",
            "Click [Shun Sender IP] in the Spoofing Center to push bad senders directly into your Cisco ASA Shun database.",
            "Click [VirusTotal Lookup] on any AMP SHA256 hash to trigger an instant file threat intelligence report.",
            "Use quick-filter chips (Message-ID, URL Reputation, AMP Logs) for 1-click Lucene log stream filtering."
        ],
        backgroundJobs: [
            "Graylog Stream 5d7ff82fb209026ab43e167b: Ingests raw ESA syslog events from ESA01 and ESA02.",
            "2-Step Batch MID Lookup: Correlates separate syslog lines (URL score, From, To, Subject) in memory."
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
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999] flex items-center justify-center p-4 md:p-6"
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-gradient-to-b from-[#1c1c22] to-[#121215] border border-[var(--border-color)] rounded-2xl w-full max-w-[680px] p-6 md:p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] relative animate-[fadeIn_0.2s_ease-out] flex flex-col max-h-[88vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-5 right-5 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] cursor-pointer p-1.5 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
                        >
                            <X size={18} />
                        </button>

                        {/* Modal Header */}
                        <div className="flex items-start gap-3.5 mb-4 pr-10">
                            <div className="p-3 rounded-xl bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                <Shield size={26} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="m-0 text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
                                        {details.title}
                                    </h2>
                                    {details.version && (
                                        <span className="text-[11px] px-2 py-0.5 bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] rounded-md border border-[var(--accent-primary)]/30 font-mono font-bold">
                                            v{details.version}
                                        </span>
                                    )}
                                </div>
                                {details.category && (
                                    <p className="text-xs font-semibold text-[var(--text-secondary)] mt-0.5 uppercase tracking-wider">
                                        {details.category}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Description Quote Banner */}
                        {details.description && (
                            <p className="text-xs text-[var(--text-secondary)] bg-[var(--bg-default)] p-3 rounded-xl border border-[var(--border-color)] mb-4 leading-relaxed">
                                {details.description}
                            </p>
                        )}

                        {/* Modal Navigation Tabs */}
                        <div className="flex border-b border-[var(--border-color)] mb-4 gap-2">
                            <button
                                onClick={() => setActiveTab("capabilities")}
                                className={`px-3 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${activeTab === "capabilities" ? "border-[var(--accent-primary)] text-[var(--accent-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                            >
                                <Sparkles size={14} />
                                Capabilities & Uses ({details.capabilities.length})
                            </button>
                            <button
                                onClick={() => setActiveTab("colors")}
                                className={`px-3 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${activeTab === "colors" ? "border-[var(--accent-primary)] text-[var(--accent-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                            >
                                <AlertCircle size={14} />
                                Badges & Color Codes ({details.colors.length})
                            </button>
                            {(details.shortcuts || details.backgroundJobs) && (
                                <button
                                    onClick={() => setActiveTab("shortcuts")}
                                    className={`px-3 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${activeTab === "shortcuts" ? "border-[var(--accent-primary)] text-[var(--accent-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                                >
                                    <Wrench size={14} />
                                    Pro Tips & Jobs
                                </button>
                            )}
                        </div>

                        {/* Scrollable Tab Content Container */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
                            {activeTab === "capabilities" && (
                                <ul className="m-0 p-0 flex flex-col gap-2.5 list-none">
                                    {details.capabilities.map((cap, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-xs text-[var(--text-primary)] leading-relaxed p-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] hover:border-[var(--accent-primary)]/40 transition-colors">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] mt-1.5 shrink-0 shadow-[0_0_6px_var(--accent-primary)]" />
                                            <span>{cap}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {activeTab === "colors" && (
                                <div className="flex flex-col gap-2.5">
                                    {details.colors.map((color, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)]">
                                            <div 
                                                className="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0 border border-white/20"
                                                style={{ 
                                                    background: color.rgb,
                                                    boxShadow: `0 0 10px ${color.rgb}`
                                                }} 
                                            />
                                            <div className="text-xs">
                                                <div className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                                    <span>{color.name}</span>
                                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-[var(--text-muted)] border border-white/5">{color.rgb}</span>
                                                </div>
                                                <p className="text-[var(--text-secondary)] mt-1 leading-relaxed">{color.meaning}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === "shortcuts" && (
                                <div className="flex flex-col gap-4">
                                    {details.shortcuts && (
                                        <div>
                                            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Terminal size={14} className="text-amber-400" />
                                                Pro Tips & Interactive Shortcuts
                                            </h4>
                                            <ul className="m-0 p-0 flex flex-col gap-2 list-none">
                                                {details.shortcuts.map((sc, i) => (
                                                    <li key={i} className="text-xs text-[var(--text-primary)] p-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] flex items-center gap-2">
                                                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] font-mono text-[10px] text-[var(--accent-primary)] font-bold">TIP</span>
                                                        <span>{sc}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {details.backgroundJobs && (
                                        <div>
                                            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Cpu size={14} className="text-cyan-400" />
                                                Background Services & Ingest Engine
                                            </h4>
                                            <ul className="m-0 p-0 flex flex-col gap-2 list-none">
                                                {details.backgroundJobs.map((job, i) => (
                                                    <li key={i} className="text-xs text-[var(--text-muted)] p-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)]">
                                                        {job}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex justify-between items-center text-[11px] text-[var(--text-muted)]">
                            <div className="flex items-center gap-1.5">
                                <Key size={13} className="text-[var(--accent-primary)]" />
                                <span>Role-based Security Utility • Pane-O-Glass</span>
                            </div>
                            <span className="font-mono">Press Esc to close</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
