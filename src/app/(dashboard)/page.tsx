import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardHome() {
    const session = await auth();
    
    if (!session) {
        redirect("/public/password-check");
    }

    const isAdmin = (session.user as any)?.role === 'ADMIN';

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

    // USER VIEW: Simplistic pending screen embedding XKCD
    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center text-center py-8">
                <h1 className="mb-4">User Dashboard</h1>
                <p className="text-text-secondary mb-8">
                    Welcome to InfoSec Tools. User-specific modules are coming soon.
                </p>
                <div className="glass-card w-full max-w-[800px] p-4 bg-bg-surface">
                    <h3 className="mb-4 border-b border-border-color pb-2">Meanwhile...</h3>

                    {xkcdData ? (
                        <div className="my-5">
                            <img
                                src={xkcdData.img}
                                alt={xkcdData.alt}
                                title={xkcdData.title}
                                className="max-w-full h-auto rounded border border-border-color mx-auto"
                            />
                            <p className="mt-3 text-sm text-text-muted">{xkcdData.alt}</p>
                        </div>
                    ) : (
                        <p className="text-text-muted my-5">Failed to load today's comic.</p>
                    )}

                    <a href="https://xkcd.com/" target="_blank" rel="noopener noreferrer" className="block text-accent-primary no-underline">
                        View on XKCD
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
            <h1 className="mb-6">Admin Command Center</h1>
            
            {/* Health Metrics */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
                <div className="glass-card">
                    <h3 className="mb-3 text-text-secondary">Role Composition</h3>
                    <p className="text-[2.5rem] font-bold text-accent-primary">{adminCount}</p>
                    <p className="mt-2 text-text-muted">Active Administrators</p>
                </div>
                <div className="glass-card">
                    <h3 className="mb-3 text-text-secondary">Security Posture</h3>
                    <p className="text-[2.5rem] font-bold text-accent-tertiary">{fwCount}</p>
                    <p className="mt-2 text-text-muted">Configured Edge Firewalls</p>
                </div>
                <div className="glass-card">
                    <h3 className="mb-3 text-text-secondary">Event Monitoring</h3>
                    <p className="text-[2.5rem] font-bold">{logCount.toLocaleString()}</p>
                    <p className="mt-2 text-text-muted">Actions Tracked (30-day)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">

                {/* Quick Actions */}
                <div className="glass-card">
                    <h3 className="mb-6 border-b border-border-color pb-3">Quick Tools</h3>
                    <div className="flex flex-col gap-3">
                        <Link href="/queries/firewall" className="btn-secondary no-underline text-center w-full p-3 rounded-lg border border-border-color">
                            Inspect Cisco Shun List
                        </Link>
                        <Link href="/queries/hibp/account" className="btn-secondary no-underline text-center w-full p-3 rounded-lg border border-border-color">
                            Run Account Security Scan
                        </Link>
                        <Link href="/users" className="btn-primary no-underline text-center w-full p-3 rounded-lg border border-accent-primary bg-accent-primary/10">
                            Manage Local Accounts
                        </Link>
                    </div>
                </div>

                {/* Audit Feed */}
                <div className="glass-card">
                    <h3 className="mb-4 border-b border-border-color pb-3">Live Activity Feed</h3>
                    <div className="flex flex-col gap-4">
                        {recentLogs.length === 0 ? (
                            <p className="text-text-muted">No recent activity to display.</p>
                        ) : (
                            recentLogs.map((log) => (
                                <div key={log.id} className="flex border-l-2 border-accent-primary pl-3">
                                    <div className="flex-1">
                                        <p className="text-sm text-text-secondary mb-1">
                                            {new Date(log.createdAt).toLocaleTimeString()} · <span className="text-text-primary">{log.user?.username || log.userId || "System"}</span>
                                        </p>
                                        <p className="text-[0.9rem]">{log.details}</p>
                                    </div>
                                    <div className="text-xs text-text-muted font-mono">
                                        {log.action}
                                    </div>
                                </div>
                            ))
                        )}
                        {recentLogs.length > 0 && (
                            <div className="pt-3 text-center">
                                <Link href="/users/audit" className="text-accent-primary text-sm no-underline">View All History &rarr;</Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="glass-card mt-6 text-center p-4">
                <h3 className="mb-4 text-text-secondary">Need a break?</h3>

                {xkcdData && (
                    <div className="my-5 flex flex-col items-center">
                        <img
                            src={xkcdData.img}
                            alt={xkcdData.alt}
                            title={xkcdData.title}
                            className="max-w-full max-h-[400px] h-auto rounded border border-border-color"
                        />
                        <p className="mt-3 text-sm text-text-muted max-w-[600px]">{xkcdData.alt}</p>
                    </div>
                )}

                <a href="https://xkcd.com/" target="_blank" rel="noopener noreferrer" className="inline-block text-accent-primary no-underline border border-accent-primary py-2 px-4 rounded">
                    View on XKCD
                </a>
            </div>
        </div>
    )
}
