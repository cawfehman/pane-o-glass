import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DomainSecurityLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    if (!isAdmin) {
        redirect('/');
    }

    return <>{children}</>;
}
