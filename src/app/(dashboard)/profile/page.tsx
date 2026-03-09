import { auth } from "@/lib/auth";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    return (
        <div>
            <h1 style={{ marginBottom: '32px' }}>My Profile</h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <div className="glass-card">
                    <h3 style={{ marginBottom: '16px' }}>Account Information</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '4px' }}>Username</label>
                            <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>{session.user?.name}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '4px' }}>Role</label>
                            <span style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                color: 'var(--accent-primary)'
                            }}>
                                {(session.user as any)?.role}
                            </span>
                        </div>
                    </div>
                </div>

                <PasswordChangeForm />
            </div>
        </div>
    );
}
