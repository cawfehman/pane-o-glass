import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/app/actions/permissions";

export default async function NotificationCenterLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const role = (session?.user as any)?.role;
    const canAccess = await hasPermission(role, 'notification-center');

    if (!canAccess) {
        redirect('/');
    }

    return <>{children}</>;
}
