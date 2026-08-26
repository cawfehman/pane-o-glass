import { Suspense } from "react";
import { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import BecDashboardClient from "@/components/bec/BecDashboardClient";

export const metadata: Metadata = {
    title: "M365 BEC Threat Hunter",
    description: "24x7 Active Monitoring, OAuth Token Theft & Fake Login Portal Hunter for Microsoft 365.",
};

export default function BecPage() {
    return (
        <div className="internal-scroll-layout p-6 bg-[var(--bg-default)]">
            <div className="shrink-0 flex flex-col gap-4 mb-4">
                <QueryHeader 
                    title="M365 BEC Threat Hunter"
                    description="Detects fake Microsoft login portals, typosquatted authentication endpoints, and external OAuth token theft links around the clock."
                    toolId="ironport"
                    icon={<ShieldAlert className="w-7 h-7 text-amber-500" />}
                />
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <Suspense fallback={
                    <div className="p-8 text-center text-sm font-semibold text-[var(--text-secondary)]">
                        Loading M365 BEC Threat Hunter...
                    </div>
                }>
                    <BecDashboardClient />
                </Suspense>
            </div>
        </div>
    );
}
