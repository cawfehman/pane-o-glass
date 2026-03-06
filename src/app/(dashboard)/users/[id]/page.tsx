import { prisma } from "@/lib/prisma";
import { updateUser } from "@/app/actions/users";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function EditUserPage({ params }: { params: { id: string } }) {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    if (!isAdmin) {
        redirect('/');
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
        where: { id }
    });

    if (!user) {
        return <div>User not found.</div>;
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '32px' }}>
                <Link href="/users" style={{ color: 'var(--text-secondary)' }}>&larr; Back</Link>
                <h1>Edit Account: {user.username}</h1>
            </div>

            <div className="glass-card" style={{ maxWidth: '600px' }}>
                <form action={async (formData) => {
                    "use server"
                    const password = formData.get("password") as string;
                    const confirmPassword = formData.get("confirmPassword") as string;

                    if (password && password !== confirmPassword) {
                        // Return early without trying to update
                        console.error("Passwords do not match");
                        // In a real app we'd use useActionState to return an error to the UI, 
                        // but for simplicity we'll just ignore the update if they don't match.
                        return;
                    }

                    await updateUser(user.id, formData);
                    redirect('/users');
                }} className="login-form">

                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input type="text" name="username" id="username" defaultValue={user.username} required />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">New Password (leave blank to keep current)</label>
                        <input type="password" name="password" id="password" />
                    </div>

                    <div className="input-group">
                        <label htmlFor="confirmPassword">Confirm New Password</label>
                        <input type="password" name="confirmPassword" id="confirmPassword" />
                    </div>

                    <div className="input-group">
                        <label htmlFor="role">Role</label>
                        <select name="role" id="role" defaultValue={user.role} style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-color)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}>
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button type="submit" className="btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
