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
            <header className="mb-8">
                <h1 className="text-3xl mb-2">My Account</h1>
                <p className="text-text-secondary">Manage your profile settings and customize your dashboard.</p>
            </header>

            <div className="flex flex-col gap-8">
                <div className="glass-card p-6 bg-bg-surface">
                    <h3 className="mb-4 text-text-primary">Account Information</h3>
                    <div className="flex gap-8">
                        <div>
                            <label className="block text-text-secondary text-xs mb-1 uppercase">Username</label>
                            <div className="text-lg font-semibold">{session.user?.name}</div>
                        </div>
                        <div>
                            <label className="block text-text-secondary text-xs mb-1 uppercase">Role</label>
                            <span className="px-2 py-1 rounded text-xs bg-accent-glow text-accent-primary font-bold">
                                {(session.user as any)?.role}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-8">
                    <ThemeSelector />
                    <SessionTimeoutSettings currentTimeout={user?.sessionTimeout || 10} />
                </div>
                
                <hr className="border-none border-t border-border-color" />
                
                <div className="glass-card p-6 bg-bg-surface">
                    <h3 className="mb-4 text-text-primary">Security Settings</h3>
                    <PasswordChangeForm user={session.user as any} />
                </div>
            </div>
        </div>
    );
}
