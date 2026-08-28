"use client";

import React from "react";
import { FileText } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import VpnReportingClient from "@/components/vpn/VpnReportingClient";

export default function VpnReportingPage() {
    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex flex-col gap-4">
                <QueryHeader
                    title="VPN Event Reporting & Audit Suite"
                    description="Audit historical Remote Access AnyConnect & Secure Client VPN connection telemetry by username, IP address, event status, and custom timeframe with 1-click CSV export."
                    toolId="vpn-reporting"
                    icon={<FileText className="w-6 h-6 text-indigo-400" />}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6 mt-4">
                <VpnReportingClient />
            </div>
        </div>
    );
}
