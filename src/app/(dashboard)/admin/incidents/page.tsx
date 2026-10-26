import { auth } from "@/lib/auth";
import { IncidentArchiveClient } from "@/components/incidents/IncidentArchiveClient";
import { ShieldAlert, Lock } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "Incident Archive & Post-Mortem Repository | InfoSec Tools",
    description: "Enterprise post-mortem security incident records, forensic timelines, and threat intelligence case files."
};

export default async function IncidentArchivePage() {
    const session = await auth();
    const role = String((session?.user as any)?.role || "USER").toUpperCase();
    const isAdmin = role === "ADMIN";

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <Lock className="w-12 h-12" />
                </div>
                <h1 className="text-xl font-bold text-text-primary">Administrator Access Required</h1>
                <p className="text-xs text-text-muted max-w-md">
                    The Incident Archive & Post-Mortem Repository contains sensitive security incident intelligence, forensic timelines, and after-action reports. Access is strictly restricted to Security Administrators.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border-light hover:bg-surface-elevated text-xs font-semibold text-text-primary transition-colors"
                >
                    Return to Dashboard
                </Link>
            </div>
        );
    }

    return <IncidentArchiveClient />;
}
