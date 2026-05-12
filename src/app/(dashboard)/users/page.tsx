import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import UserForm from "@/components/UserForm";
import UserTableClient from "@/components/UserTableClient";

export default async function UsersPage() {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    if (!isAdmin) {
        redirect('/');
    }

    const users = await prisma.user.findMany({
        orderBy: { username: 'asc' }
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
                    <UserTableClient initialUsers={users} />
                </div>
            </div>
        </div>
    );
}
