import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/app/actions/permissions";

export default async function DomainSecurityLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const role = (session?.user as any)?.role;
    const canAccess = await hasPermission(role, 'hibp-domain');

    if (!canAccess) {
        redirect('/');
    }

    return <>{children}</>;
}
