"use client";

import { useState, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";

export interface TooltipDetails {
    title: string;
    capabilities: string[];
    colors: { name: string; meaning: string; rgb: string }[];
    backgroundJobs?: string[];
    version?: string;
}

export const helpData: Record<string, TooltipDetails> = {
    firewall: {
        title: "Cisco Firewall & Guardian",
        version: "1.3.0",
        capabilities: [
            "Query active IP shuns across all 4 perimeter firewalls (Wilmington Primary/Secondary & Keleman Primary/Secondary).",
            "Manually remove shuns to unblock false-positive connections with administrative audit logging.",
            "Historical Shun Database: Search persistent historic shun database with IP ASN, Organization, and Geolocation enrichment.",
            "Hourly Snapshot Tracking: Audit historical shun snapshot logs across all firewalls.",
            "Audit 'Guardian' logs—automated background defense system that detects brute-force attacks and auto-shuns malicious IPs.",
            "Intelligent Auto-Unshun: Validates failed usernames against Active Directory LDAP; auto-unshuns valid employees who mis-typed passwords while blacklisting external attackers.",
            "Guardian Blacklist Management: Maintain persistent blacklist of IPs barred from auto-unshunning.",
            "Catch-Up Scans: Execute manual recovery scans with custom minute ranges (--range <minutes>)."
        ],
        colors: [
            { name: "Green (Active / Heartbeat)", meaning: "Guardian service is active and scanning, or firewall connection is healthy.", rgb: "#22c55e" },
            { name: "Amber / Yellow (Warning)", meaning: "Guardian encountered a temporary scan issue or firewall warning.", rgb: "#eab308" },
            { name: "Red (Stalled / Shunned)", meaning: "Guardian heartbeat is down, or IP is actively shunned on the firewall.", rgb: "#ef4444" },
            { name: "Purple (Enriched)", meaning: "Shun record has been enriched with ASN and Geolocation metadata.", rgb: "#a855f7" }
        ],
        backgroundJobs: [
            "Guardian Automated Scanner: Cron checks host connection statuses and manages threat lists.",
            "Shun Snapshot Sync: Periodically snapshots active shuns across all firewall pairs."
        ]
    },
    ise: {
        title: "Cisco ISE Center",
        version: "1.2.0",
        capabilities: [
            "Query active wired and wireless endpoint connection sessions by MAC address, username, or IP.",
            "Inspect user login sessions, Auth protocols (EAP-TLS, PEAP, MAB), Network Devices, and VLAN assignments.",
            "Failure Triage & Analysis: Diagnose endpoint authentication failures and policy rejections in real time.",
            "Verify live port connection paths (Switch, Interface, and Port Security profiles).",
            "Corporate Site Directory: Look up physical addresses, floor maps, and site contact lists."
        ],
        colors: [
            { name: "Green (Active / Success)", meaning: "Successful active endpoint authentication and network authorization.", rgb: "#22c55e" },
            { name: "Red (Failure / Rejected)", meaning: "Authentication failure or authorization profile rejection.", rgb: "#ef4444" },
            { name: "Light Blue (Info)", meaning: "Informational syslog profile status.", rgb: "#3b82f6" },
            { name: "Gray (Local)", meaning: "IP is local/private (RFC 1918) and bypassed external Geolocation.", rgb: "#9ca3af" }
        ]
    },
    vpn: {
        title: "VPN Troubleshooting Dashboard",
        version: "2.1.0",
        capabilities: [
            "Search real-time AnyConnect / Secure Client VPN connection logs using natural date queries (e.g. 'username last 7 days', 'june 6-8', 'last 24 hours').",
            "Interactive Connection Map: Visualize active global and domestic VPN tunnels with dual World and US State views, interactive pin clustering, and automatic IPLocate geocoding.",
            "Capacity & Load Telemetry: Track 24-Hour Peak Unique Users, Average Weekday Users, Average Weekend Users, and active session counts.",
            "Session Bandwidth Analysis: Troubleshoot session durations and inspect Top Bandwidth Consumers by upload (Tx), download (Rx), and total data transfer.",
            "Security Insights: Audit top failed usernames (with Active Directory format validation), top failed ASNs, and international non-US connections.",
            "Identity Hover Popovers: Hover over any username to trigger real-time Active Directory LDAP cards with Locked Out (🔒) and Disabled account detection.",
            "Protocol & Stream Badging: Differentiate SSL (blue) vs IKEv2/IPSec (purple) and Reconnect (Kel-3140 in rose) vs Connect (WDC-FTD in green)."
        ],
        colors: [
            { name: "Green (Connected / Active)", meaning: "Client successfully authenticated and established an active tunnel.", rgb: "#22c55e" },
            { name: "Red (Failed Connection)", meaning: "Connection rejected. Displays reason (invalid credentials, certificate failure, timeout).", rgb: "#ef4444" },
            { name: "Amber (International / Non-US)", meaning: "Connection originating from outside the United States. Highlighted for security review.", rgb: "#f59e0b" },
            { name: "Blue (Disconnect / Teardown)", meaning: "Session disconnected cleanly; badge contains duration and byte transfer totals.", rgb: "#3b82f6" },
            { name: "Sky Blue / Purple (Protocol)", meaning: "SSL VPN (blue) vs IKEv2 / IPSec (purple) protocol badges.", rgb: "#a855f7" },
            { name: "Rose / Green (Gateway Stream)", meaning: "R (Keleman Kel-3140 Reconnect in rose) vs C (Wilmington WDC-FTD Connect in green).", rgb: "#ec4899" },
            { name: "Orange Lock Badge (🔒)", meaning: "AD account is actively Locked Out in Active Directory.", rgb: "#ffa500" },
            { name: "Red Warning Badge (⚠️)", meaning: "Username not found in Active Directory (potential typo or external probe).", rgb: "#ff4d4d" }
        ],
        backgroundJobs: [
            "Graylog VPN Sync: Ingests VPN authentication, disconnect, and byte stats from Graylog clusters.",
            "IP Geolocation Cache: Auto-enriches and caches regional lat/long coordinates for domestic & global source IPs."
        ]
    },
    'ise-tacacs': {
        title: "TACACS+ Administration Audit",
        version: "1.1.0",
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
        title: "Have I Been Pwned? (HIBP) Account Security",
        version: "1.1.0",
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
        title: "Have I Been Pwned? (HIBP) Domain Security",
        version: "2.4.0",
        capabilities: [
            "Domain-Wide Breach Intelligence: Query compromised email aliases and credential leaks across all verified organizational domains.",
            "Active Directory Identity Enrichment: Real-time AD status (Active in yellow, Disabled in red), Title, Department, Locked status, and Password Last Set date.",
            "Direct 1-Click Notification Staging: Stage filtered breached employees directly into the Corporate Breach Notification Center.",
            "Unified Breach & Category Filtering: Search by breach name (e.g. LinkedIn, Adobe) or filter across 140+ compromised data categories with configurable ALL (AND) and ANY (OR) matching logic.",
            "1-Click Quick Category Presets: Instantly filter by critical threat categories: Passwords (⚠️), Credit cards (💳), Social security numbers (🪪), Bank account numbers (🏦), Auth tokens (🔑), and Health insurance information (🩺).",
            "Multi-Category Risk Badges: Clean standardized SVG badges (AlertTriangle ⚠️, CreditCard 💳, IdCard 🪪, Activity Pulse 📈) appear consistently across cards and tables.",
            "Interactive Breach Details Modal: View full incident writeups, global pwn counts, compromised data attributes, and check organizational impact.",
            "3-Way CSV Export Suite: One-click export for Active Accounts Only (Outlook Mail Merge), All Accounts (Mail Merge), or Full Diagnostic CSV."
        ],
        colors: [
            { name: "Yellow Badge & Border (Active AD Account)", meaning: "Active corporate Active Directory account appearing in breach datasets. Prioritize for notification and password resets.", rgb: "#facc15" },
            { name: "Red / Rose (Disabled / Locked Account)", meaning: "Disabled or locked corporate account appearing in breach datasets.", rgb: "#ef4444" },
            { name: "⚠️ Red Alert Triangle (Passwords / Credentials)", meaning: "Breach dataset exposes user passwords, password hints, historical passwords, auth tokens, PINs, or encryption keys.", rgb: "#f43f5e" },
            { name: "💳 Amber Credit Card (Financial Data)", meaning: "Breach dataset exposes Credit cards, CVVs, Bank account numbers, partial credit cards, or crypto wallets.", rgb: "#f59e0b" },
            { name: "🪪 Purple ID Card (Government & Identity)", meaning: "Breach dataset exposes Social Security Numbers (SSNs), Passports, Driver's Licenses, or Government-issued IDs.", rgb: "#a855f7" },
            { name: "📈 Pink Activity Pulse (Health & Medical)", meaning: "Breach dataset exposes Health insurance information, Personal health/medical records, or Biometric data.", rgb: "#ec4899" }
        ]
    },
    'notification-center': {
        title: "Corporate Breach Notification Center",
        version: "2.0.0",
        capabilities: [
            "Centralized Campaign Management: Stage, review, spot-check, test, approve, and dispatch customized mail-merge security advisories to impacted corporate staff.",
            "Dynamic Mail Merge & Conditional Logic: Automatically populate employee and incident details using {{Name}}, {{Email}}, {{BreachName}}, {{BreachDate}}, {{BreachDetails}}, {{ExposedCategories}}, {{AccountStatus}}, and {{#if Key}} conditional blocks.",
            "Visual WYSIWYG & HTML Template Hub: Create and customize reusable templates with rich-text formatting, bullet lists, Cooper Brand Red (#C3002F) styling, and real-time sanitized preview.",
            "Paginated Spot-Checking & Search: Search and inspect staged recipient lists and delivery logs with custom page limits (10, 15, 25, 50, 100) and instant multi-field query matching.",
            "1-Click CSV Delivery Export: Download complete delivery logs with recipient emails, names, timestamps, delivery verdicts, and failure error messages for auditing.",
            "Sandbox Self-Test Simulator: Test any campaign by selecting an actual recipient and safely routing the test email directly to your logged-in administrator inbox (restricted to @cooperhealth.edu).",
            "Smart Duplicate & Size Guards: Automatic de-duplication of email addresses from uploaded CSVs and browser memory guards against oversized (>5MB) files.",
            "Campaign Recovery & Retry: 1-click 'Retry Failed' for partial completions and 'Reset & Retry' for stalled dispatch recovery.",
            "Role-Based Self-Approval & Throttled Queue: Authorized security staff (Admin, Systems, Analyst) can review and approve batches, sent with throttled relay delivery.",
            "Direct 1-Click HIBP Integration: Seamlessly stage active accounts from any HIBP Domain Security search directly into the Notification Center."
        ],
        colors: [
            { name: "Amber (Draft)", meaning: "Campaign is currently staged as a draft and awaiting template assignment or sandbox testing.", rgb: "#f59e0b" },
            { name: "Purple (Sandbox Tested)", meaning: "Sandbox test email was safely dispatched to the administrator inbox for review.", rgb: "#a855f7" },
            { name: "Blue (Sending / In-Flight)", meaning: "Campaign is actively dispatching emails in throttled batches through the corporate relay.", rgb: "#3b82f6" },
            { name: "Orange (Stalled)", meaning: "Dispatch loop was interrupted or crashed mid-run. Requires operator review and reset.", rgb: "#f97316" },
            { name: "Amber / Yellow (Completed with Errors)", meaning: "Campaign finished dispatching with some failed deliveries. Failed recipients can be retried.", rgb: "#eab308" },
            { name: "Green (Completed)", meaning: "All staged recipient notification emails were successfully delivered.", rgb: "#22c55e" },
            { name: "Rose (Breach Incident)", meaning: "Identifies the source breach or security incident badge on campaign cards and tables.", rgb: "#f43f5e" }
        ]
    },
    'threat-intel': {
        title: "Threat Intelligence Reputation Analyzer",
        version: "1.1.0",
        capabilities: [
            "Perform real-time reputation analysis on public/private IPs, Domain Names, and File Signatures.",
            "Resolve live DNS zone records (A, MX, NS, TXT) directly from the authoritative DNS servers.",
            "Check domain safety, risk classifications, and categories against Cisco Umbrella Investigate database.",
            "Scan file hashes (MD5, SHA-1, SHA-256) to identify malware families and threat signatures.",
            "Audit Logging: Automatically record indicator lookups in central audit database."
        ],
        colors: [
            { name: "Green (Benign / Clean)", meaning: "Indicator is determined to be clean with a risk index close to 0.", rgb: "#22c55e" },
            { name: "Amber (Suspicious)", meaning: "Threat assessment identified potential indicators of compromise (risk index 30-70).", rgb: "#eab308" },
            { name: "Red (Malicious)", meaning: "High-severity threat indicators, active ransomware, or flagged C2/malware categories (risk index 70-100).", rgb: "#ef4444" },
            { name: "Blue (Internal)", meaning: "Private RFC 1918 IP address. Bypasses external reputation checks.", rgb: "#3b82f6" }
        ]
    },
    ironport: {
        title: "Cisco IronPort Email Security Telemetry",
        version: "1.3.0",
        capabilities: [
            "Monitor real-time inbound/outbound email telemetry aligned 1:1 with Cisco SMA Mail Flow Summary categories.",
            "Track Clean Delivered Mail (messages passing all security filters), Whitelisted & Graymail, URL Rewrites, and Malware Verdicts & Queue Delays.",
            "Monitor ESA appliance health and load distribution across ESA01 (esa01.cooperhealth.edu) and ESA02 (esa02.cooperhealth.edu).",
            "Filter telemetry dynamically across scalable timeframes (1h, 6h, 12h, 24h, 3d, 7d).",
            "Render smooth continuous numeric time-series trends comparing Total Inbound Mail against Whitelisted Senders Policy.",
            "Perform ad-hoc Lucene searches across raw Cisco IronPort ESA syslog streams with quick-filter chips.",
            "Parse delay reasons (e.g. 4.1.0 Too many recipients) automatically with warning highlights.",
            "Trace complete email thread lifecycles by clicking any Message ID (MID) badge."
        ],
        colors: [
            { name: "Emerald Green (Clean Delivered)", meaning: "Clean inbound emails passing all security, reputation, & spam filters cleanly.", rgb: "#10b981" },
            { name: "Purple (Whitelisted & Graymail)", meaning: "Inbound messages allowed via Whitelisted Addresses policy or Graymail Engine.", rgb: "#a855f7" },
            { name: "Orange (URL Rewrites & Proxy)", meaning: "URLs matched by web reputation rules and redirected through Cisco Security Proxy.", rgb: "#f97316" },
            { name: "Red (Malware Verdicts & Delays)", meaning: "Non-clean Sophos/McAfee/AMP malware verdicts and receiver queue delays.", rgb: "#ef4444" },
            { name: "Cyan (ESA01) / Indigo (ESA02)", meaning: "Per-appliance traffic share and queue status for ESA01 and ESA02.", rgb: "#06b6d4" }
        ],
        backgroundJobs: [
            "Graylog Stream 5d7ff82fb209026ab43e167b: Absolute non-overlapping time-series ingestion.",
            "IronPort Graylog Sync: Hourly cron sync caching top-of-hour metrics into local database."
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
                className="bg-transparent border-none text-text-muted cursor-pointer p-1.5 rounded-full inline-flex items-center justify-center transition-colors duration-200 align-middle help-trigger-btn hover:bg-white/10 hover:text-text-primary"
                title="View Tool Tip Sheet"
            >
                <HelpCircle size={iconSize} />
            </button>

            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-5"
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-[#121214] border border-border-color rounded-2xl w-full max-w-[560px] p-7 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5),0_10px_10px_-5px_rgba(0,0,0,0.4)] relative animate-[fadeIn_0.25s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-5 right-5 bg-transparent border-none text-text-secondary cursor-pointer p-1 rounded flex items-center justify-center hover:bg-white/10 hover:text-text-primary transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="m-0 mb-4 text-2xl font-extrabold text-text-primary flex items-center gap-2.5 flex-wrap">
                            <HelpCircle size={24} className="text-accent-primary" />
                            <span>{details.title}</span>
                            {details.version && (
                                <span className="text-xs bg-[var(--bg-secondary,#1e1e24)] text-text-secondary py-0.5 px-2 rounded-xl border border-border-color font-medium ml-auto">
                                    v{details.version}
                                </span>
                            )}
                        </h2>

                        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
                            <div>
                                <h4 className="m-0 mb-2 text-text-secondary uppercase text-xs tracking-wider font-bold">Capabilities & Uses</h4>
                                <ul className="m-0 pl-5 text-text-primary text-[0.925rem] flex flex-col gap-1.5 leading-relaxed list-disc">
                                    {details.capabilities.map((cap, i) => (
                                        <li key={i}>{cap}</li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h4 className="m-0 mb-2.5 text-text-secondary uppercase text-xs tracking-wider font-bold">Color Codes & Legends</h4>
                                <div className="flex flex-col gap-2">
                                    {details.colors.map((color, i) => (
                                        <div key={i} className="flex items-start gap-2.5">
                                            <span 
                                                className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                                                style={{ 
                                                    background: color.rgb,
                                                    boxShadow: `0 0 6px ${color.rgb}`
                                                }} 
                                            />
                                            <div className="text-[0.9rem] leading-snug">
                                                <strong className="text-text-primary">{color.name}: </strong>
                                                <span className="text-text-secondary">{color.meaning}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {details.backgroundJobs && (
                                <div className="border-t border-border-color pt-4">
                                    <h4 className="m-0 mb-2 text-text-secondary uppercase text-xs tracking-wider font-bold">Background Services</h4>
                                    <ul className="m-0 pl-5 text-text-muted text-[0.85rem] flex flex-col gap-1 leading-snug list-disc">
                                        {details.backgroundJobs.map((job, i) => (
                                            <li key={i}>{job}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
