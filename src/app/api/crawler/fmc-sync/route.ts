import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { syncFmcFirewallsToCrawler } from "@/lib/fmc-crawler-sync";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "crawler"))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler or Admin permission required." }, { status: 403 });
        }

        const result = await syncFmcFirewallsToCrawler((session.user as any)?.id);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("FMC Crawler Sync Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
