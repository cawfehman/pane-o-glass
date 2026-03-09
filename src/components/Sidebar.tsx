import { auth } from "@/lib/auth";
import SidebarClient from "./SidebarClient";
import { getPermissionsForRole } from "@/app/actions/permissions";

export default async function Sidebar() {
    const session = await auth();
    const role = (session?.user as any)?.role || 'USER';
    const permissions = await getPermissionsForRole(role);

    return <SidebarClient role={role} permissions={permissions} />;
}
