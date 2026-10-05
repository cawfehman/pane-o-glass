import { Suspense } from "react";
import { Metadata } from "next";
import { DownloadCloud } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import GraylogExporterClient from "./GraylogExporterClient";

export const metadata: Metadata = {
    title: "Graylog Bulk Results Exporter | Utilities",
    description: "Automated large-scale Graylog log extractor bypassing the 10k query limit via adaptive bisection slicing and compressed packaging.",
};

export default function GraylogExporterPage() {
    return (
        <div className="internal-scroll-layout p-6 bg-[var(--bg-default)]">
            <div className="shrink-0 flex flex-col gap-4 mb-4">
                <QueryHeader 
                    title="Graylog Bulk Results Exporter"
                    description="Extract enterprise log datasets beyond Graylog's 10,000-event limit with automated adaptive time-slicing, disk-aware pre-flight estimation, and All-in-One compressed ZIP packaging."
                    toolId="graylog-exporter"
                    icon={<DownloadCloud className="w-7 h-7 text-cyan-400" />}
                />
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <Suspense fallback={
                    <div className="p-8 text-center text-sm font-semibold text-[var(--text-secondary)]">
                        Connecting to Graylog Cluster Services...
                    </div>
                }>
                    <GraylogExporterClient />
                </Suspense>
            </div>
        </div>
    );
}
