import { prisma } from "@/lib/prisma";
import { deleteUser } from "@/app/actions/users";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import UserForm from "@/components/UserForm";

export default async function UsersPage() {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    if (!isAdmin) {
        redirect('/');
    }

    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
    });

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <h1>Local Accounts</h1>
                </div>

                <div className="glass-card" style={{ marginBottom: '32px' }}>
                    <h3 style={{ marginBottom: '16px' }}>Create New Account</h3>
                    <UserForm />
                </div>
            </div>

            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h3 style={{ marginBottom: '16px', flexShrink: 0 }}>Existing Accounts</h3>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead className="sticky-header">
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '12px 8px' }}>Username</th>
                                <th style={{ padding: '12px 8px' }}>Name</th>
                                <th style={{ padding: '12px 8px' }}>Role</th>
                                <th style={{ padding: '12px 8px' }}>Last Login</th>
                                <th style={{ padding: '12px 8px' }}>Created At</th>
                                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user: any) => (
                                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 8px', fontWeight: 500 }}>{user.username}</td>
                                    <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>
                                        {user.firstName || user.lastName 
                                            ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
                                            : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.875rem' }}>Not set</span>
                                        }
                                    </td>
                                    <td style={{ padding: '12px 8px' }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                backgroundColor: 
                                                    user.role === 'ADMIN' ? 'rgba(59, 130, 246, 0.2)' : 
                                                    user.role === 'ANALYST' ? 'rgba(168, 85, 247, 0.2)' : 
                                                    user.role === 'SYSTEMS' ? 'rgba(20, 184, 166, 0.2)' :
                                                    'var(--bg-surface-hover)',
                                                color: 
                                                    user.role === 'ADMIN' ? 'var(--accent-primary)' : 
                                                    user.role === 'ANALYST' ? 'rgb(192, 132, 252)' : 
                                                    user.role === 'SYSTEMS' ? 'rgb(45, 212, 191)' :
                                                    'var(--text-secondary)'
                                            }}>
                                                {user.role}
                                            </span>
                                            {user.isExternal && (
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.75rem',
                                                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                                    color: 'rgb(74, 222, 128)',
                                                    border: '1px solid rgba(34, 197, 94, 0.2)'
                                                }} title="Authenticates via Active Directory">
                                                    AD / EXT
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                                    </td>
                                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                        <a href={`/users/${user.id}`} style={{
                                            background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px'
                                        }} className="nav-link">
                                            Edit
                                        </a>
                                        <form action={async () => {
                                            "use server"
                                            await deleteUser(user.id)
                                        }}>
                                            <button type="submit" style={{
                                                background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px'
                                            }} className="nav-link">
                                                Delete
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No accounts found. Create the first one above!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
