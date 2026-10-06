import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/app/actions/permissions";
import VpnS2sDashboardClient from "./VpnS2sDashboardClient";

export const metadata = {
    title: "Cisco FTD / FMC Site-to-Site VPN Monitor | InfoSec Portal",
    description: "Monitor and troubleshoot IPsec/IKE site-to-site VPN tunnels on Cisco FTD firewalls managed by Firepower Management Center (FMC)."
};

export default async function VpnS2sPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/auth/signin");
    }

    const role = (session.user as any)?.role || "USER";
    const allowed = await hasPermission(role, "vpn-s2s");

    if (!allowed) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-400">
                    <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-text-primary">Access Denied</h1>
                <p className="text-text-secondary max-w-md text-sm">
                    You do not have permission to view the Cisco Site-to-Site VPN Monitor. Contact an Administrator to request the <code className="text-rose-400 font-mono text-xs px-1.5 py-0.5 rounded bg-bg-surface border border-border-color">vpn-s2s</code> entitlement.
                </p>
            </div>
        );
    }

    return (
        <div className="internal-scroll-layout max-w-7xl mx-auto w-full h-full pb-2">
            <VpnS2sDashboardClient role={role} />
        </div>
    );
}
