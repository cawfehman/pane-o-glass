import { signOut } from "@/lib/auth"
import { auth } from "@/lib/auth"

export default async function Topbar() {
    const session = await auth()

    return (
        <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontWeight: 500 }}>{session?.user?.name || "User"}</span>
                <form action={async () => {
                    "use server"
                    await signOut({ redirectTo: "/login" })
                }}>
                    <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>Logout</button>
                </form>
            </div>
        </header>
    );
}
