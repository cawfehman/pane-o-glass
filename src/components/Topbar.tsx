import { performLogout } from "@/app/actions/users"
import { auth } from "@/lib/auth"

export default async function Topbar() {
    const session = await auth()

    return (
        <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontWeight: 500 }}>{session?.user?.name || "User"}</span>
                <form action={performLogout}>
                    <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>Logout</button>
                </form>
            </div>
        </header>
    );
}
