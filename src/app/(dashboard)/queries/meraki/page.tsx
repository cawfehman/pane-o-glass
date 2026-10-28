import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import MerakiDashboardClient from "@/components/meraki/MerakiDashboardClient";

export const dynamic = "force-dynamic";

export default async function MerakiPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/login");
    }

    const role = (session.user as any)?.role || "USER";
    const allowed = await hasPermission(role, "meraki", session.user.id);
    if (!allowed) {
        redirect("/queries");
    }

    return <MerakiDashboardClient />;
}
