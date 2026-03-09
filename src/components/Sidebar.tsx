import { auth } from "@/lib/auth";
import SidebarClient from "./SidebarClient";

export default async function Sidebar() {
    const session = await auth();
    const role = (session?.user as any)?.role || 'USER';

    return <SidebarClient role={role} />;
}
