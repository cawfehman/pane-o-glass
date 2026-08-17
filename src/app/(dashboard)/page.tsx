import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { 
    Shield, Network, Server, Globe, Lock, ShieldAlert, 
    ShieldCheck, Mail, Map, ArrowRight, UserCheck, Sparkles 
} from "lucide-react";

export default async function DashboardHome() {
    const session = await auth();
    
    if (!session) {
        redirect("/public/password-check");
    }

    const user = session.user as any;
    const role = user?.role || 'USER';
    const permissions: string[] = user?.permissions || [];
    const isAdmin = role === 'ADMIN';
    const isAnalyst = role === 'ANALYST' || isAdmin;

    const hasPermission = (toolId: string) => isAdmin || permissions.includes(toolId);

    // Fetch today's XKCD Comic
    let xkcdData = null;
    try {
        const xkcdRes = await fetch("https://xkcd.com/info.0.json", { next: { revalidate: 3600 } });
        if (xkcdRes.ok) {
            xkcdData = await xkcdRes.json();
        }
    } catch (e) {
        console.error("Failed to fetch XKCD:", e);
    }

    // NON-ADMIN VIEW: Rich portal with active tool launcher and status overview
    if (!isAdmin) {
        const toolCards = [
            {
                id: 'vpn',
                title: 'VPN Troubleshooting',
                desc: 'Investigate AnyConnect sessions, disconnect anomalies, geo-lookups, and latency metrics.',
                href: '/queries/vpn',
                icon: Network,
                badge: 'Live Logs',
                badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            },
            {
                id: 'firewall',
                title: 'Cisco Firewall Utilities',
                desc: 'Query ASA/FTD shuns, inspect Graylog auto-unshun history, and manage safety blacklists.',
                href: '/queries/firewall',
                icon: Shield,
                badge: 'Guardian Active',
                badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            },
            {
                id: 'ise',
                title: 'Cisco ISE Center',
                desc: 'Analyze RADIUS authentications, MAC authentication bypass, endpoint profiling, and posture.',
                href: '/queries/ise',
                icon: Server,
                badge: 'Forensics',
                badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
            },
            {
                id: 'threat-intel',
                title: 'Threat Intelligence',
                desc: 'Query IP and domain reputation scores across AbuseIPDB, VirusTotal, and AlienVault OTX.',
                href: '/queries/threat-intel',
                icon: Globe,
                badge: 'Multi-Engine',
                badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            },
            {
                id: 'ise-tacacs',
                title: 'TACACS+ Administration',
                desc: 'Review administrative switch logins, command authorizations, and configuration changes.',
                href: '/queries/tacacs',
                icon: Lock,
                badge: 'Audit Trail',
                badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            },
            {
                id: 'hibp-account',
                title: 'HIBP Account Security',
                desc: 'Audit employee credentials against known public breaches and exposed database dumps.',
                href: '/queries/hibp/account',
                icon: ShieldAlert,
                badge: 'Compromise Scan',
                badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            },
            {
                id: 'hibp-domain',
                title: 'HIBP Domain Security',
                desc: 'Scan entire enterprise domain scopes for active credential exposures across dark web leaks.',
                href: '/queries/hibp/domain',
                icon: ShieldCheck,
                badge: 'Domain Scope',
                badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
            },
            {
                id: 'ironport',
                title: 'IronPort Email Telemetry',
                desc: 'Track mail delivery, spam rejections, TLS handshakes, and quarantined message envelopes.',
                href: '/queries/ironport',
                icon: Mail,
                badge: 'Mail Gateways',
                badgeColor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
            },
            {
                id: 'site-management',
                title: 'Site Mapping Engine',
                desc: 'Maintain campus, branch, and data center subnet ranges and physical location coordinates.',
                href: '/settings/sites',
                icon: Map,
                badge: 'Subnets',
                badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/20'
            }
        ];

        const accessibleTools = toolCards.filter(tool => isAnalyst || hasPermission(tool.id));

        return (
            <div className="flex flex-col gap-6 max-w-7xl mx-auto">
                {/* Welcome Banner */}
                <div className="glass-card p-6 bg-gradient-to-r from-bg-surface via-bg-surface to-accent-primary/10 border-border-color">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent-glow text-accent-primary border border-accent-primary/20">
                                    {role} ACCESS
                                </span>
                                <span className="text-xs text-text-muted">Welcome back, {user?.name || user?.username}!</span>
                            </div>
                            <h1 className="text-2xl font-black text-text-primary m-0">InfoSec Command Portal</h1>
                            <p className="text-sm text-text-secondary mt-1 m-0">
                                Access your authorized security utilities, investigate incidents, and monitor system telemetry.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-dark border border-border-color text-xs">
                                <UserCheck size={16} className="text-emerald-400" />
                                <span className="text-text-secondary">{accessibleTools.length} Tools Authorized</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Authorized Tool Grid */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-text-primary m-0 flex items-center gap-2">
                            <Sparkles size={18} className="text-accent-primary" />
                            Authorized Security Utilities
                        </h2>
                        <span className="text-xs text-text-muted">Click any module to launch</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {accessibleTools.map((tool) => {
                            const Icon = tool.icon;
                            return (
                                <Link
                                    key={tool.id}
                                    href={tool.href}
                                    className="glass-card p-5 border border-border-color hover:border-accent-primary/50 transition-all group flex flex-col justify-between cursor-pointer hover:shadow-lg no-underline"
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="p-2.5 rounded-xl bg-bg-dark border border-border-color text-accent-primary group-hover:bg-accent-glow transition-colors">
                                                <Icon size={20} />
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[0.7rem] font-bold border ${tool.badgeColor}`}>
                                                {tool.badge}
                                            </span>
                                        </div>
                                        <h3 className="text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors m-0 mb-1.5">
                                            {tool.title}
                                        </h3>
                                        <p className="text-xs text-text-secondary leading-relaxed m-0">
                                            {tool.desc}
                                        </p>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-border-color/60 flex items-center justify-between text-xs font-semibold text-accent-primary group-hover:translate-x-1 transition-transform">
                                        <span>Launch Module</span>
                                        <ArrowRight size={14} />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Daily Tech Break (XKCD) */}
                <div className="glass-card p-6 border border-border-color flex flex-col items-center text-center">
                    <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">
                        ☕ Daily Security & Tech Break
                    </h3>

                    {xkcdData ? (
                        <div className="my-2 max-w-xl">
                            <img
                                src={xkcdData.img}
                                alt={xkcdData.alt}
                                title={xkcdData.title}
                                className="max-w-full max-h-[380px] h-auto rounded-lg border border-border-color mx-auto shadow-sm"
                            />
                            <p className="mt-3 text-xs text-text-muted italic">{xkcdData.alt}</p>
                        </div>
                    ) : (
                        <p className="text-text-muted text-xs my-4">Daily comic unavailable.</p>
                    )}

                    <a 
                        href="https://xkcd.com/" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mt-3 text-xs text-accent-primary hover:underline font-semibold"
                    >
                        View Original on XKCD &rarr;
                    </a>
                </div>
            </div>
        );
    }

    // ADMIN VIEW: Data driven system overview
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    const logCount = await prisma.auditLog.count();

    let fwCount = 0;
    try {
        const firewalls = JSON.parse(process.env.FIREWALL_CONFIG || "[]");
        fwCount = Array.isArray(firewalls) ? firewalls.length : 0;
    } catch (e) { }

    const recentLogs = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { username: true } } }
    });

    return (
        <div className="flex flex-col gap-6">
            <h1 className="m-0 text-2xl font-black text-text-primary">Admin Command Center</h1>
            
            {/* Health Metrics */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
                <div className="glass-card p-5">
                    <h3 className="mb-2 text-xs font-bold text-text-secondary uppercase tracking-wider">Role Composition</h3>
                    <p className="text-3xl font-black text-accent-primary m-0">{adminCount}</p>
                    <p className="mt-1 text-xs text-text-muted m-0">Active Administrators</p>
                </div>
                <div className="glass-card p-5">
                    <h3 className="mb-2 text-xs font-bold text-text-secondary uppercase tracking-wider">Security Posture</h3>
                    <p className="text-3xl font-black text-accent-tertiary m-0">{fwCount}</p>
                    <p className="mt-1 text-xs text-text-muted m-0">Configured Edge Firewalls</p>
                </div>
                <div className="glass-card p-5">
                    <h3 className="mb-2 text-xs font-bold text-text-secondary uppercase tracking-wider">Event Monitoring</h3>
                    <p className="text-3xl font-black text-text-primary m-0">{logCount.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-text-muted m-0">Actions Tracked (30-day)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Quick Actions */}
                <div className="glass-card p-5">
                    <h3 className="mb-4 border-b border-border-color pb-3 text-base font-bold text-text-primary">Quick Tools</h3>
                    <div className="flex flex-col gap-3">
                        <Link href="/queries/firewall" className="p-3 rounded-lg border border-border-color bg-bg-dark text-text-primary text-sm font-semibold hover:border-accent-primary transition-colors no-underline text-center">
                            Inspect Cisco Shun List
                        </Link>
                        <Link href="/queries/vpn" className="p-3 rounded-lg border border-border-color bg-bg-dark text-text-primary text-sm font-semibold hover:border-accent-primary transition-colors no-underline text-center">
                            Troubleshoot VPN Sessions
                        </Link>
                        <Link href="/users" className="btn-primary p-3 rounded-lg text-sm font-semibold text-center no-underline">
                            Manage Local Accounts
                        </Link>
                    </div>
                </div>

                {/* Audit Feed */}
                <div className="glass-card p-5 flex flex-col justify-between">
                    <div>
                        <h3 className="mb-4 border-b border-border-color pb-3 text-base font-bold text-text-primary">Live Activity Feed</h3>
                        <div className="flex flex-col gap-3">
                            {recentLogs.length === 0 ? (
                                <p className="text-text-muted text-xs">No recent activity to display.</p>
                            ) : (
                                recentLogs.map((log) => (
                                    <div key={log.id} className="flex border-l-2 border-accent-primary pl-3 py-0.5">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-text-muted mb-0.5 m-0">
                                                {new Date(log.createdAt).toLocaleTimeString()} · <strong className="text-text-primary font-semibold">{log.user?.username || log.userId || "System"}</strong>
                                            </p>
                                            <p className="text-xs text-text-secondary truncate m-0">{log.details}</p>
                                        </div>
                                        <div className="text-[0.7rem] text-text-muted font-mono ml-2 shrink-0">
                                            {log.action}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    {recentLogs.length > 0 && (
                        <div className="pt-3 border-t border-border-color/60 text-center mt-3">
                            <Link href="/users/audit" className="text-accent-primary text-xs font-semibold no-underline hover:underline">
                                View All History &rarr;
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* Tech Break */}
            <div className="glass-card p-6 border border-border-color flex flex-col items-center text-center">
                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">
                    ☕ Daily Security & Tech Break
                </h3>

                {xkcdData && (
                    <div className="my-2 max-w-xl">
                        <img
                            src={xkcdData.img}
                            alt={xkcdData.alt}
                            title={xkcdData.title}
                            className="max-w-full max-h-[380px] h-auto rounded-lg border border-border-color mx-auto shadow-sm"
                        />
                        <p className="mt-3 text-xs text-text-muted italic">{xkcdData.alt}</p>
                    </div>
                )}

                <a 
                    href="https://xkcd.com/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-3 text-xs text-accent-primary hover:underline font-semibold"
                >
                    View Original on XKCD &rarr;
                </a>
            </div>
        </div>
    );
}
