import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPermissionsForRole } from "@/app/actions/permissions";
import { ShieldAlert, Database, Activity, Lock, Terminal, Network, Search } from "lucide-react";

export default async function QueriesPage() {
    const session = await auth();
    const role = (session?.user as any)?.role || "USER";
    const normalizedRole = String(role).toUpperCase();
    const isAdmin = normalizedRole === "ADMIN";
    
    // Fetch dynamic permissions from DB
    const permissions = await getPermissionsForRole(normalizedRole);
    const hasPermission = (toolId: string) => permissions.includes(toolId);

    const tools = [
        {
            id: 'hibp-account',
            title: "HIBP Account Safety",
            href: "/queries/hibp/account",
            description: "Check if specific email addresses or accounts have been exposed in known public data breaches.",
            icon: <ShieldAlert size={24} />
        },
        {
            id: 'hibp-domain',
            title: "HIBP Domain Safety",
            href: "/queries/hibp/domain",
            description: "Monitor your corporate domains for large-scale breaches and identify leaked credentials across all employees.",
            icon: <Database size={24} />
        },
        {
            id: 'ise',
            title: "Cisco ISE Sessions",
            href: "/queries/ise",
            description: "View real-time active network sessions and identity details for wireless and wired clients across the enterprise.",
            icon: <Activity size={24} />
        },
        {
            id: 'ise-failures',
            title: "ISE Auth Failures",
            href: "/queries/ise-failures",
            description: "Analyze global authentication failures to identify brute-force attempts or network configuration issues.",
            icon: <Lock size={24} />
        },
        {
            id: 'firewall',
            title: "Cisco Firewall Utilities",
            href: "/queries/firewall",
            description: "Query IP shuns across edge firewalls and audit the automated Guardian background unshun events.",
            icon: <Terminal size={24} />
        },
        {
            id: 'tacacs',
            title: "TACACS Audit Logs",
            href: "/queries/tacacs",
            description: "Audit administrative access to network devices and track command executions across your infrastructure.",
            icon: <Search size={24} />
        },
        {
            id: 'network',
            title: "Network Diagnostics",
            href: "/queries/network",
            description: "Query network pathing, infrastructure status, and diagnostic telemetry from core switches.",
            icon: <Network size={24} />
        }
    ];

    const visibleTools = tools.filter(tool => hasPermission(tool.id));

    return (
        <div className="page-container">
            <header style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>
                    System Tools & Queries
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    Centralized forensic control center for network infrastructure and security intelligence.
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                {visibleTools.map((tool) => (
                    <Link key={tool.id} href={tool.href} style={{ textDecoration: 'none' }}>
                        <div className="glass-card" style={{ 
                            cursor: 'pointer', 
                            transition: 'all 0.2s ease-in-out', 
                            height: '100%', 
                            background: 'var(--bg-surface)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ 
                                    background: 'var(--accent-glow)', 
                                    padding: '12px', 
                                    borderRadius: '12px', 
                                    color: 'var(--accent-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {tool.icon}
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 600 }}>
                                    {tool.title}
                                </h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
                                {tool.description}
                            </p>
                        </div>
                    </Link>
                ))}

                {/* If no tools are available */}
                {visibleTools.length === 0 && (
                    <div className="glass-card" style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center' }}>
                        <ShieldAlert size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                        <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>No Tools Accessible</h2>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                            Your current role ({role}) does not have permission to access any system queries. 
                            Please contact an administrator to request access.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
