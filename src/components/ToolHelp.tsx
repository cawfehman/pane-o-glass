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
        version: "1.0.0",
        capabilities: [
            "Query current active IP shuns across configured Cisco perimeter firewalls.",
            "Manually remove shuns to unblock false-positive connections.",
            "Review historic manual shun and unshun auditing events.",
            "Audit 'Guardian' logs—our background automation system that automatically shuns malicious IPs trying to brute-force network entry points.",
            "Manage the 'Guardian Blacklist'—a persistent list of IPs barred from auto-unshunning (e.g. repeated unshun triggers or failed faked domain usernames).",
            "Perform automatic Active Directory lookup checks to verify whether failed corporate usernames exist before allowing auto-unshuns.",
            "Utilize command-line range parameters (--range <minutes>) for manual outage recovery/catch-up scans."
        ],
        colors: [
            { name: "Green (heartbeat)", meaning: "Guardian service is active and scanning.", rgb: "#22c55e" },
            { name: "Amber/Yellow (warning)", meaning: "Guardian is running but encountered an error on the last scan.", rgb: "#eab308" },
            { name: "Red (stalled)", meaning: "Guardian heartbeat is down or missing.", rgb: "#ef4444" }
        ],
        backgroundJobs: ["Guardian Automated Scanner: Cron checks host connection statuses and manages threat lists."]
    },
    ise: {
        title: "Cisco ISE Center",
        version: "1.0.0",
        capabilities: [
            "Query active wired/wireless endpoint connection parameters by MAC address, username, or IP.",
            "Inspect details of user login sessions, including Auth protocols, Network Devices, and VLAN assignments.",
            "Verify live port connection paths (Switch, Port, and Port Security profiles).",
            "Look up locations, addresses, and site contacts from the corporate site directory list."
        ],
        colors: [
            { name: "Green (Active)", meaning: "Successful active endpoint authentication.", rgb: "#22c55e" },
            { name: "Light Blue (Info)", meaning: "Informational syslog profile status.", rgb: "#3b82f6" },
            { name: "Gray (Local)", meaning: "IP is local/private and bypassed Geolocation enrichment.", rgb: "#9ca3af" }
        ]
    },
    vpn: {
        title: "VPN Troubleshooting Dashboard",
        version: "1.2.0",
        capabilities: [
            "Search real-time VPN connection logs using advanced date-range queries (e.g. 'username last 7 days', 'username june 6-8', or standalone ranges like 'last 24 hours').",
            "Troubleshoot logins, inspect session durations, and track total upload (Tx) / download (Rx) bandwidth.",
            "Review 'Security Insights' cards highlighting failed usernames and international Non-US connections.",
            "Hover over usernames to trigger real-time Active Directory LDAP lookup cards (supports all username formats).",
            "Differentiate connection protocols (SSL in blue, IKEv2 in purple) and stream sources (R/Reconnect for Kel-3140 in rose, C/Connect for WDC-FTD in green)."
        ],
        colors: [
            { name: "Green (Badge)", meaning: "Client successfully connected to the VPN gateway.", rgb: "#22c55e" },
            { name: "Red (Badge)", meaning: "Connection failed. Displays the rejection reason (e.g. invalid password).", rgb: "#ef4444" },
            { name: "Soft Amber (Highlight)", meaning: "International connection warning. Left-border warning shows when source IP country code is outside the United States.", rgb: "#f59e0b" },
            { name: "Blue (Badge)", meaning: "Disconnect connection teardown message containing byte stats.", rgb: "#3b82f6" },
            { name: "Sky Blue / Purple (Protocol)", meaning: "SSL vs IKEv2 (IPSec) VPN connection types.", rgb: "#a855f7" },
            { name: "Rose / Green (Stream)", meaning: "R (Keleman Kel-3140 Reconnect stream) vs C (Wilmington WDC-FTD Connect stream) source badges.", rgb: "#ec4899" },
            { name: "Orange Lock Badge (🔒)", meaning: "AD account is Locked Out.", rgb: "#ffa500" },
            { name: "Red Warning Badge (⚠️)", meaning: "Username not found in Active Directory.", rgb: "#ff4d4d" }
        ],
        backgroundJobs: ["Graylog VPN Sync: Syncs VPN authentication logs from Graylog to the SQLite database relative or absolute ranges."]
    },
    'ise-tacacs': {
        title: "TACACS+ Administration Audit",
        version: "1.0.0",
        capabilities: [
            "Search administrative logins into network switches, routers, and firewalls.",
            "Audit the precise CLI commands executed by engineers during sessions.",
            "Check command status to confirm command execution authority (Permit vs Deny logs)."
        ],
        colors: [
            { name: "Green (Success)", meaning: "Administration session authentication or command execution permitted.", rgb: "#22c55e" },
            { name: "Red (Deny)", meaning: "Administrative command execution denied by policy.", rgb: "#ef4444" }
        ]
    },
    'hibp-account': {
        title: "Have I Been Pwned? (HIBP) Account Security",
        version: "1.0.0",
        capabilities: [
            "Query external databases to check if a specific corporate account has been compromised.",
            "List all known breach names, dates, leaked data types, and severity scales associated with the email address."
        ],
        colors: [
            { name: "Red Warning", meaning: "Account found in leaked data breach set. Urgent password reset recommended.", rgb: "#ef4444" },
            { name: "Green Check", meaning: "No breach history found for the query.", rgb: "#22c55e" }
        ]
    },
    'hibp-domain': {
        title: "Have I Been Pwned? (HIBP) Domain Security",
        version: "2.3.0",
        capabilities: [
            "Domain-Wide Breach Intelligence: Query compromised email aliases and credential leaks across all verified organizational domains.",
            "Active Directory Identity Enrichment: Real-time AD status (Active in high-contrast yellow badge, Disabled in red), Title, Department, Locked status, and Password Last Set date.",
            "Unified Breach & Category Filtering: Search by breach name (e.g. LinkedIn, Adobe) or filter across 140+ compromised data categories with configurable ALL (AND) and ANY (OR) matching logic.",
            "1-Click Quick Category Presets: Instantly filter by critical threat categories: Passwords (⚠️), Credit cards (💳), Social security numbers (🪪), Bank account numbers (🏦), Auth tokens (🔑), and Health insurance information (🩺).",
            "Multi-Category Risk Badges: Clean, standardized SVG icons (AlertTriangle ⚠️, CreditCard 💳, IdCard 🪪, Activity Pulse 📈) appear consistently across employee cards, breach pills, and data tables.",
            "Interactive Breach Details Modal: Hover over any breach pill for quick exposure summaries or click it to view complete incident writeups, global pwn counts, and check domain impact.",
            "3-Way CSV Export Suite: One-click export for Active Accounts Only (Outlook Mail Merge with First Last names), All Accounts (Mail Merge), or Full Diagnostic CSV (raw AD attributes & full breach history)."
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
        version: "1.0.0",
        capabilities: [
            "Centralized Notification Management: Stage, review, test, approve, and dispatch customized mail-merge security alerts to corporate staff.",
            "Dynamic Mail Merge Placeholders: Automatically populate employee and breach details using {{Name}}, {{Email}}, {{BreachName}}, {{BreachDate}}, {{BreachDetails}}, {{ExposedCategories}}, and {{AccountStatus}}.",
            "Visual Rich-Text & HTML Template Hub: Create and customize reusable email templates with 1-click variable insertion buttons and responsive live preview.",
            "Sandbox Self-Test Simulator: Test any campaign by selecting an actual recipient and safely routing the test email directly to your logged-in administrator inbox.",
            "Save / Resume Draft Campaigns: Save campaigns in progress, refine recipient lists, switch templates, and resume dispatch at any time.",
            "Role-Based Self-Approval & Throttled Queue: Authorized security staff (Admin, Systems, Analyst) can review and approve batches, sent with throttled relay delivery.",
            "Direct 1-Click HIBP Integration: Seamlessly stage active accounts from any HIBP Domain Security search directly into the Notification Center."
        ],
        colors: [
            { name: "Amber (Draft)", meaning: "Campaign is currently staged as a draft and awaiting template assignment or sandbox testing.", rgb: "#f59e0b" },
            { name: "Purple (Test Dispatched)", meaning: "Sandbox test email was safely dispatched to the administrator inbox for review.", rgb: "#a855f7" },
            { name: "Blue (Sending / In-Flight)", meaning: "Campaign is actively dispatching emails in throttled batches through the corporate relay.", rgb: "#3b82f6" },
            { name: "Green (Completed)", meaning: "All staged recipient notification emails were successfully delivered.", rgb: "#22c55e" },
            { name: "Rose (Failed / Errors)", meaning: "Delivery encountered SMTP relay errors or invalid recipient addresses.", rgb: "#ef4444" }
        ]
    },
    'threat-intel': {
        title: "Threat Intelligence Reputation Analyzer",
        version: "1.0.0",
        capabilities: [
            "Perform real-time reputation analysis on public/private IPs, Domain Names, and File Signatures.",
            "Resolve live DNS zone records (A, MX, NS, TXT) directly from the target DNS servers.",
            "Check domain safety, risk classifications, and categories against Cisco Umbrella Investigate database.",
            "Scan file hashes (MD5, SHA-1, SHA-256) to identify malware families and threat signatures.",
            "Automatically log lookups into the central system database for audit compliance."
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
        version: "1.2.0",
        capabilities: [
            "Monitor real-time inbound/outbound clean mail volume, queue delays, URL rewrites, and antivirus/AMP verdicts.",
            "Track ESA appliance health and load distribution across ESA01 (esa01.cooperhealth.edu) and ESA02 (esa02.cooperhealth.edu).",
            "Filter telemetry dynamically across scalable timeframes (1h, 6h, 12h, 24h, 3d, 7d).",
            "Render smooth continuous numeric time-series trends comparing Total Inbound Mail against Whitelisted Senders Policy.",
            "Perform ad-hoc Lucene searches across raw Cisco IronPort ESA syslog streams.",
            "Parse delay reasons (e.g. 4.1.0 Too many recipients) automatically with warning highlights.",
            "Trace complete email thread lifecycles by clicking any Message ID (MID) badge."
        ],
        colors: [
            { name: "Blue (Volume)", meaning: "Clean inbound email messages evaluated and accepted by ESA policy.", rgb: "#3b82f6" },
            { name: "Amber (Delayed)", meaning: "Mail delivery queue delays or system resource congestion on ESA receivers.", rgb: "#f59e0b" },
            { name: "Orange (URL Rewrites)", meaning: "URLs matched by reputation rules and redirected through Cisco Security Proxy.", rgb: "#f97316" },
            { name: "Red (Malware)", meaning: "Non-clean Antivirus (McAfee/Sophos) or Cisco AMP malware verdicts.", rgb: "#ef4444" },
            { name: "Purple (Whitelisted)", meaning: "Inbound messages matching the Whitelisted Senders policy stream.", rgb: "#a855f7" },
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
