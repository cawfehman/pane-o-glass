"use client";

import { useState } from "react";
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
            "Audit 'Guardian' logs—our background automation system that automatically shuns malicious IPs trying to brute-force network entry points."
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
        version: "1.1.0",
        capabilities: [
            "Search real-time AnyConnect / Secure Client VPN connection logs.",
            "Troubleshoot logins, inspect session durations, and track total upload (Tx) / download (Rx) bandwidth.",
            "Review 'Security Insights' cards highlighting failed usernames and international Non-US connections.",
            "Click on corporate usernames (name-name format) to trigger hoverable Active Directory LDAP directory lookup cards.",
            "Differentiate connection protocols (SSL in blue, IKEv2 in purple) and stream sources (R/Reconnect for Kel-3140 in rose, C/Connect for WDC-FTD in green)."
        ],
        colors: [
            { name: "Green (Badge)", meaning: "Client successfully connected to the VPN gateway.", rgb: "#22c55e" },
            { name: "Red (Badge)", meaning: "Connection failed. Displays the rejection reason (e.g. invalid password).", rgb: "#ef4444" },
            { name: "Soft Amber (Highlight)", meaning: "International connection warning. Left-border warning shows when source IP country code is outside the United States.", rgb: "#f59e0b" },
            { name: "Blue (Badge)", meaning: "Disconnect connection teardown message containing byte stats.", rgb: "#3b82f6" },
            { name: "Sky Blue / Purple (Protocol)", meaning: "SSL vs IKEv2 (IPSec) VPN connection types.", rgb: "#a855f7" },
            { name: "Rose / Green (Stream)", meaning: "R (Keleman Kel-3140 Reconnect stream) vs C (Wilmington WDC-FTD Connect stream) source badges.", rgb: "#ec4899" }
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
        version: "1.0.0",
        capabilities: [
            "Track leaked account credentials domain-wide for all corporate domain names.",
            "Identify high-risk compromise groups across department scopes."
        ],
        colors: [
            { name: "Amber (Summary)", meaning: "Identified credentials leaked within domain data breaches.", rgb: "#fbbf24" }
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

    if (!details) return null;

    return (
        <>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsOpen(true);
                }}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.2s, background-color 0.2s',
                    verticalAlign: 'middle',
                    ...triggerStyle
                }}
                className="help-trigger-btn"
                title="View Tool Tip Sheet"
            >
                <HelpCircle size={iconSize} />
            </button>

            {isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}
                onClick={() => setIsOpen(false)}
                >
                    <div style={{
                        background: '#121214',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '560px',
                        padding: '28px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
                        position: 'relative',
                        animation: 'fadeIn 0.25s ease-out'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <X size={20} />
                        </button>

                        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <HelpCircle size={24} style={{ color: 'var(--accent-primary)' }} />
                            <span>{details.title}</span>
                            {details.version && (
                                <span style={{ 
                                    fontSize: '0.75rem', 
                                    background: 'var(--bg-secondary, #1e1e24)', 
                                    color: 'var(--text-secondary)', 
                                    padding: '2px 8px', 
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-color)',
                                    fontWeight: 500,
                                    marginLeft: 'auto'
                                }}>
                                    v{details.version}
                                </span>
                            )}
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', fontWeight: 700 }}>Capabilities & Uses</h4>
                                <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-primary)', fontSize: '0.925rem', display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: 1.5 }}>
                                    {details.capabilities.map((cap, i) => (
                                        <li key={i}>{cap}</li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', fontWeight: 700 }}>Color Codes & Legends</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {details.colors.map((color, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                            <span style={{ 
                                                width: '10px', 
                                                height: '10px', 
                                                borderRadius: '50%', 
                                                background: color.rgb,
                                                marginTop: '5px',
                                                flexShrink: 0,
                                                boxShadow: `0 0 6px ${color.rgb}`
                                            }} />
                                            <div style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                                                <strong style={{ color: 'var(--text-primary)' }}>{color.name}: </strong>
                                                <span style={{ color: 'var(--text-secondary)' }}>{color.meaning}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {details.backgroundJobs && (
                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                                    <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', fontWeight: 700 }}>Background Services</h4>
                                    <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px', lineHeight: 1.4 }}>
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
