import { auth } from "@/lib/auth";
import SidebarClient from "./SidebarClient";

export default async function Sidebar() {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    return <SidebarClient isAdmin={isAdmin} />;
}
