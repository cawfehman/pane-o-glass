import { auth } from "@/lib/auth"
import UserMenu from "./UserMenu"

export default async function Topbar() {
    const session = await auth()

    return (
        <header className="topbar">
            <UserMenu userName={session?.user?.name || "User"} />
        </header>
    );
}
