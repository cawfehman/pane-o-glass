import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPermissionsForRole } from "@/app/actions/permissions";
import { ShieldAlert, Activity, Lock, Terminal, ShieldCheck } from "lucide-react";

export default async function QueriesPage() {
    const session = await auth();
    const role = (session?.user as any)?.role || "USER";
    const normalizedRole = String(role).toUpperCase();
    const isAdmin = normalizedRole === "ADMIN";
    
    // Fetch dynamic permissions from DB
    const permissions = await getPermissionsForRole(normalizedRole);
    const hasPermission = (toolId: string) => isAdmin || permissions.includes(toolId);

    const tools = [
        {
            id: 'firewall',
            title: "Cisco Firewall",
            href: "/queries/firewall",
            description: "Query IP shuns across edge firewalls and audit background 'Guardian' automation events.",
            icon: <Terminal size={24} />
        },
        {
            id: 'ise',
            title: "Cisco ISE Center",
            href: "/queries/ise",
            description: "Monitor real-time network authentication sessions and identity services for wired and wireless clients.",
            icon: <Activity size={24} />
        },
        {
            id: 'ise-tacacs',
            title: "TACACS+ Administration",
            href: "/queries/tacacs",
            description: "Audit administrative access to network devices and track command executions across the infrastructure.",
            icon: <Lock size={24} />
        },
        {
            id: 'hibp-account',
            title: "HIBP Account Security",
            href: "/queries/hibp/account",
            description: "Search the 'Have I Been Pwned' database to identify if specific accounts have been compromised in breaches.",
            icon: <ShieldAlert size={24} />
        },
        {
            id: 'hibp-domain',
            title: "HIBP Domain Security",
            href: "/queries/hibp/domain",
            description: "Monitor domain-wide breach data to identify leaked credentials across all corporate employees.",
            icon: <ShieldCheck size={24} />
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
                            flexDirection: 'column',
                            border: '1px solid var(--border-color)'
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
