import { Suspense } from "react";
import { Metadata } from "next";
import { Layers } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import NetscalerDashboardClient from "@/components/netscaler/NetscalerDashboardClient";

export const metadata: Metadata = {
    title: "NetScaler Gateway & ADC Analytics",
    description: "NetScaler ADC and Citrix Gateway log ingestion, authentication telemetry, foreign geo-access tracking, and user session analysis.",
};

export default function NetscalerPage() {
    return (
        <div className="internal-scroll-layout p-6 bg-[var(--bg-default)]">
            <div className="shrink-0 flex flex-col gap-4 mb-4">
                <QueryHeader 
                    title="NetScaler Gateway & ADC Telemetry"
                    description="Real-time Citrix Gateway authentication flow, foreign access threat hunting, and deep user/IP session tracing from Graylog."
                    toolId="netscaler"
                    icon={<Layers className="w-7 h-7 text-teal-400" />}
                />
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <Suspense fallback={
                    <div className="p-8 text-center text-sm font-semibold text-[var(--text-secondary)]">
                        Connecting to NetScaler Telemetry Stream...
                    </div>
                }>
                    <NetscalerDashboardClient />
                </Suspense>
            </div>
        </div>
    );
}
