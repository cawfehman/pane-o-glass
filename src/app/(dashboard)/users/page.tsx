import { prisma } from "@/lib/prisma";
import { createUser, deleteUser } from "@/app/actions/users";

export default async function UsersPage() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
    });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h1>Local Accounts</h1>
                {/* Simple inline modal-like form trick (using HTML5 dialog or details, but let's keep it direct for now) */}
            </div>

            <div className="glass-card" style={{ marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px' }}>Create New Account</h3>
                <form action={createUser} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input type="text" name="username" id="username" required placeholder="admin_user" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input type="password" name="password" id="password" required />
                    </div>
                    <div className="input-group">
                        <label htmlFor="role">Role</label>
                        <input type="text" name="role" id="role" defaultValue="USER" />
                    </div>
                    <button type="submit" className="btn-primary" style={{ marginBottom: '2px' }}>Create Account</button>
                </form>
            </div>

            <div className="glass-card">
                <h3 style={{ marginBottom: '16px' }}>Existing Accounts</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '12px 8px' }}>Username</th>
                            <th style={{ padding: '12px 8px' }}>Role</th>
                            <th style={{ padding: '12px 8px' }}>Created At</th>
                            <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user: any) => (
                            <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '12px 8px', fontWeight: 500 }}>{user.username}</td>
                                <td style={{ padding: '12px 8px' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        backgroundColor: user.role === 'ADMIN' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-surface-hover)',
                                        color: user.role === 'ADMIN' ? 'var(--accent-primary)' : 'var(--text-secondary)'
                                    }}>
                                        {user.role}
                                    </span>
                                </td>
                                <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </td>
                                <td style={{ padding: '12px 8px', textAlign: 'right' }}>
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
                                <td colSpan={4} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No accounts found. Create the first one above!
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
