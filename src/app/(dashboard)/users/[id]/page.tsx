import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserForm from "@/components/UserForm";

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

            <div className="glass-card" style={{ maxWidth: '800px' }}>
                <UserForm user={user} mode="edit" />
            </div>
        </div>
    );
}
