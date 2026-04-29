import { auth } from "@/lib/auth";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import ThemeSelector from "@/components/ThemeSelector";
import { redirect } from "next/navigation";
import SessionTimeoutSettings from "@/components/SessionTimeoutSettings";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user?.id }
    });

    return (
        <div className="page-container">
            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>My Account</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage your profile settings and customize your dashboard.</p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="glass-card" style={{ padding: '1.5rem', background: 'var(--bg-surface)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Account Information</h3>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                        <div>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase' }}>Username</label>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{session.user?.name}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase' }}>Role</label>
                            <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                backgroundColor: 'var(--accent-glow)',
                                color: 'var(--accent-primary)',
                                fontWeight: 700
                            }}>
                                {(session.user as any)?.role}
                            </span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
                    <ThemeSelector />
                    <SessionTimeoutSettings currentTimeout={user?.sessionTimeout || 10} />
                </div>
                
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />
                
                <div className="glass-card" style={{ padding: '1.5rem', background: 'var(--bg-surface)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Security Settings</h3>
                    <PasswordChangeForm user={session.user as any} />
                </div>
            </div>
        </div>
    );
}
