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
            <div className="shrink-0">
                <div className="flex justify-between items-center mb-8">
                    <h1>Local Accounts</h1>
                </div>

                <div className="glass-card mb-8">
                    <h3 className="mb-4">Create New Account</h3>
                    <UserForm />
                </div>
            </div>

            <div className="glass-card flex-1 flex flex-col min-h-0">
                <h3 className="mb-4 shrink-0">Existing Accounts</h3>
                <div className="flex-1 overflow-auto">
                    <UserTableClient initialUsers={users} />
                </div>
            </div>
        </div>
    );
}
