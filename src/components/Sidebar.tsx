import { auth } from "@/lib/auth";
import SidebarClient from "./SidebarClient";
import { getEffectivePermissions } from "@/app/actions/permissions";

export default async function Sidebar() {
    const session = await auth();
    const role = (session?.user as any)?.role || 'USER';
    const userId = session?.user?.id;
    const normalizedRole = String(role).toUpperCase();
    const permissions = await getEffectivePermissions(userId, normalizedRole);

    return <SidebarClient role={normalizedRole} permissions={permissions} />;
}
