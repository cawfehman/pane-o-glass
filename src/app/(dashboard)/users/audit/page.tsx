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

    const whereClause: any = {};
    if (actionFilter) {
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

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1>Audit Logs</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>View system activity and track user actions.</p>
                </div>
                <div>
                    <a href="/api/audit/export" className="btn-primary" style={{ textDecoration: 'none', background: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                        Download CSV
                    </a>
                </div>
            </div>

            <form method="GET" style={{ flexShrink: 0, display: 'flex', gap: '16px', marginBottom: '24px' }}>
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
                <Link href="/users/audit" className="btn-primary" style={{ textDecoration: 'none', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                    Clear
                </Link>
            </form>

            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
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
