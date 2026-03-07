import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
export default async function DashboardHome() {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    // USER VIEW: Simplistic pending screen embedding XKCD
    if (!isAdmin) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem 0' }}>
                <h1 style={{ marginBottom: '16px' }}>User Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                    Welcome to LinuxDash. User-specific modules are coming soon.
                </p>
                <div className="glass-card" style={{ width: '100%', maxWidth: '800px', padding: '16px', background: 'var(--bg-surface)' }}>
                    <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Meanwhile...</h3>
                    {/* Note: XKCD does not allow iframe embedding of the main site due to X-Frame-Options, but they offer an API. Let's just link out for simplicity or use a placeholder iframe mechanism */}
                    <a href="https://xkcd.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '20px 0', color: 'var(--accent-primary)', textDecoration: 'none' }}>
                        Click here to read today's XKCD Comic
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
        <div>
            <h1 style={{ marginBottom: '24px' }}>Admin Command Center</h1>

            {/* Health Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div className="glass-card">
                    <h3 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Role Composition</h3>
                    <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{adminCount}</p>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>Active Administrators</p>
                </div>
                <div className="glass-card">
                    <h3 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Security Posture</h3>
                    <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-tertiary)' }}>{fwCount}</p>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>Configured Edge Firewalls</p>
                </div>
                <div className="glass-card">
                    <h3 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Event Monitoring</h3>
                    <p style={{ fontSize: '2.5rem', fontWeight: 700 }}>{logCount.toLocaleString()}</p>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>Actions Tracked (30-day)</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>

                {/* Quick Actions */}
                <div className="glass-card">
                    <h3 style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Quick Tools</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Link href="/queries/firewall" className="btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            Inspect Cisco Shun List
                        </Link>
                        <Link href="/queries/hibp/account" className="btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            Run Account Security Scan
                        </Link>
                        <Link href="/users" className="btn-primary" style={{ textDecoration: 'none', textAlign: 'center', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'rgba(56, 189, 248, 0.1)' }}>
                            Manage Local Accounts
                        </Link>
                    </div>
                </div>

                {/* Audit Feed */}
                <div className="glass-card">
                    <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Live Activity Feed</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {recentLogs.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No recent activity to display.</p>
                        ) : (
                            recentLogs.map((log) => (
                                <div key={log.id} style={{ display: 'flex', borderLeft: '2px solid var(--accent-primary)', paddingLeft: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                            {new Date(log.createdAt).toLocaleTimeString()} · <span style={{ color: 'var(--text-primary)' }}>{log.user?.username || log.userId || "System"}</span>
                                        </p>
                                        <p style={{ fontSize: '0.9rem' }}>{log.details}</p>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        {log.action}
                                    </div>
                                </div>
                            ))
                        )}
                        {recentLogs.length > 0 && (
                            <div style={{ paddingTop: '12px', textAlign: 'center' }}>
                                <Link href="/users/audit" style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', textDecoration: 'none' }}>View All History &rarr;</Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginTop: '24px', textAlign: 'center', padding: '16px' }}>
                <a href="https://xkcd.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                    Need a break? Read today's XKCD Comic
                </a>
            </div>
        </div>
    )
}
