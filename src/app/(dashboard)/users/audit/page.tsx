import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AuditLogsPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const searchParams = await props.searchParams;
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    if (!isAdmin) {
        redirect("/");
    }

    const userFilter = typeof searchParams.user === 'string' ? searchParams.user : undefined;
    const actionFilter = typeof searchParams.action === 'string' ? searchParams.action : undefined;
    const activeTab = searchParams.tab === 'quota' ? 'quota' : 'audit';

    const whereClause: any = {};
    if (activeTab === 'quota') {
        whereClause.action = { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] };
    } else {
        whereClause.action = { notIn: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] };
    }

    if (actionFilter) {
        // Overlay explicit filter (case insensitive check)
        whereClause.action = { contains: actionFilter };
    }
    if (userFilter) {
        whereClause.OR = [
            { userId: { contains: userFilter } },
            { user: { username: { contains: userFilter } } }
        ];
    }

    const logs = await prisma.auditLog.findMany({
        where: whereClause,
        orderBy: {
            createdAt: 'desc'
        },
        take: 500,
        include: {
            user: {
                select: {
                    username: true
                }
            }
        }
    });

    // Fetch IPLocate Quota Counters
    let quotaCounters = { daily: 0, weekly: 0, monthly: 0, allTime: 0 };
    if (activeTab === 'quota') {
        const now = new Date();
        const startOfToday = new Date(now.toISOString().slice(0, 10)); // UTC 00:00
        const startOfSevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOfThirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [daily, weekly, monthly, allTime] = await Promise.all([
            prisma.auditLog.count({
                where: {
                    action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] },
                    createdAt: { gte: startOfToday }
                }
            }),
            prisma.auditLog.count({
                where: {
                    action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] },
                    createdAt: { gte: startOfSevenDays }
                }
            }),
            prisma.auditLog.count({
                where: {
                    action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] },
                    createdAt: { gte: startOfThirtyDays }
                }
            }),
            prisma.auditLog.count({
                where: {
                    action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] }
                }
            })
        ]);

        quotaCounters = { daily, weekly, monthly, allTime };
    }

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex gap-2 border-b border-[var(--border-color)] mb-6 pb-2">
                <Link 
                    href="/users/audit"
                    style={{
                        padding: '8px 16px',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        color: activeTab === 'audit' ? 'var(--text-primary)' : 'var(--text-muted)',
                        background: activeTab === 'audit' ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: '1px solid',
                        borderColor: activeTab === 'audit' ? 'var(--border-color)' : 'transparent'
                    }}
                >
                    Standard Audit Logs
                </Link>
                <Link 
                    href="/users/audit?tab=quota"
                    style={{
                        padding: '8px 16px',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        color: activeTab === 'quota' ? 'var(--text-primary)' : 'var(--text-muted)',
                        background: activeTab === 'quota' ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: '1px solid',
                        borderColor: activeTab === 'quota' ? 'var(--border-color)' : 'transparent'
                    }}
                >
                    IPLocate Quota Debug Logs
                </Link>
            </div>

            {activeTab === 'quota' && (
                <div className="shrink-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
                    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Daily Queries</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{quotaCounters.daily}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Since 00:00 UTC</span>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Weekly Queries</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{quotaCounters.weekly}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Last 7 days</span>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Monthly Queries</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{quotaCounters.monthly}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Last 30 days</span>
                    </div>
                    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>All Time Queries</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{quotaCounters.allTime}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Total queries logged</span>
                    </div>
                </div>
            )}

            <div className="shrink-0 flex justify-between items-center mb-8">
                <div>
                    <h1>Audit Logs</h1>
                    <p className="text-[var(--text-secondary)]">View system activity and track user actions.</p>
                </div>
                <div>
                    <a href="/api/audit/export" className="btn-primary no-underline bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-primary)]">
                        Download CSV
                    </a>
                </div>
            </div>

            <form method="GET" className="shrink-0 flex gap-4 mb-6">
                {activeTab === 'quota' && <input type="hidden" name="tab" value="quota" />}
                <input 
                    type="text" 
                    name="user" 
                    placeholder="Filter by user..." 
                    defaultValue={userFilter || ''}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', width: '200px' }}
                />
                <input 
                    type="text" 
                    name="action" 
                    placeholder="Filter by action..." 
                    defaultValue={actionFilter || ''}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', width: '200px' }}
                />
                <button type="submit" className="btn-primary">Filter</button>
                <Link href={activeTab === 'quota' ? "/users/audit?tab=quota" : "/users/audit"} className="btn-primary no-underline bg-transparent border border-[var(--border-color)] text-[var(--text-primary)]">
                    Clear
                </Link>
            </form>

            <div className="glass-card flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto overflow-x-auto">
                    <table className="w-full collapse text-left">
                        <thead className="sticky-header">
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Time</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>User</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Action</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Details</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>IP Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit logs found.</td>
                                </tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                                            {log.user?.username || log.userId || "System"}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                                            {log.details}
                                        </td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {log.ipAddress || "Internal"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
