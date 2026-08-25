import { EtdDashboardClient } from "@/components/etd/EtdDashboardClient";

export const metadata = {
    title: "Cisco ETD Retrospective Center | Pane-O-Glass Security Dashboard",
    description: "Monitor cloud retrospective threat verdicts, calculate user exposure window deltas, and deep-link directly to Cisco CMD portal records."
};

export default function EtdPage() {
    return <EtdDashboardClient />;
}
