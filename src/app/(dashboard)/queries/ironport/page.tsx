import { Suspense } from "react";
import { Metadata } from "next";
import { Mail } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import IronportDashboardClient from "@/components/ironport/IronportDashboardClient";

export const metadata: Metadata = {
    title: "IronPort Health & Threat Dashboard",
    description: "Monitor Cisco IronPort logs from Old Graylog for health, mail delays, and threat metrics.",
};

export default function IronportPage() {
    return (
        <div className="internal-scroll-layout p-6 bg-[var(--bg-default)]">
            <div className="shrink-0 flex flex-col gap-4 mb-4">
                <QueryHeader 
                    title="IronPort Telemetry & Health"
                    description="System health, delivery issues, mail flow trends, and threat analysis aggregated from Graylog."
                    toolId="ironport"
                    icon={<Mail className="w-7 h-7 text-blue-500" />}
                />
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <Suspense fallback={
                    <div className="p-8 text-center text-sm font-semibold text-[var(--text-secondary)]">
                        Loading IronPort Telemetry...
                    </div>
                }>
                    <IronportDashboardClient />
                </Suspense>
            </div>
        </div>
    );
}
